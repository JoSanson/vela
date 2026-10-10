import type { ShellSnapshot } from '@vela/shared';
import { app, dialog, session, shell } from 'electron';
import { pathToFileURL } from 'node:url';
import { openLocalFile, runCommand, savePageAs } from '../commands';
import { flushStateNow } from '../index';
import type { AppContext } from '../context';
import { showSidebarMenu } from '../contextMenu';
import { findInTab, stopFind } from '../find';
import { fetchSuggestions } from '../suggest';
import { extractReadable } from '../reader';
import { paletteFromFile, pickImageAndExtract } from '../themeFromImage';
import { detectSources, runImport } from '../importer';
import { exportState, importFromFile, importState, saveExportToFile } from '../exporter';
import { emit, handle, isTrustedShell } from './typed';
import { ipcMain } from 'electron';
import { channel, UNRESERVED_SHORTCUTS } from '@vela/shared';

const UNRESERVED_IDS = new Set(UNRESERVED_SHORTCUTS.map((s) => s.id));

export function registerCoreHandlers(ctx: AppContext): void {
  const { store, prefs, tabs, windows, overlay } = ctx;
  const liveContents = (): Electron.WebContents[] =>
    tabs
      .liveTabIds()
      .map((id) => tabs.webContents(id))
      .filter((wc): wc is Electron.WebContents => !!wc);

  handle('snapshot/get', 'internal', (_req, event): ShellSnapshot => {
    return {
      state: store.state,
      rev: store.rev,
      prefs: prefs.value,
      version: ctx.version,
      platform: process.platform as ShellSnapshot['platform'],
      windowId: event.sender.id,
      overlay: overlay.current,
      faviconToken: ctx.favicons.token,
      little: windows.littleFor(event.sender.id) ? { tabId: 'little' } : null,
    };
  });

  handle('state/dispatch', 'internal', (action) => {
    store.dispatch(action);
    return undefined;
  });

  handle('prefs/set', 'internal', (patch) => prefs.set(patch));

  handle('tab/openUrl', 'internal', (req) => tabs.openUrl(req));
  handle('tab/navigate', 'shell', ({ tabId, input }) => {
    tabs.navigate(tabId, input);
    return undefined;
  });
  handle('tab/back', 'shell', ({ tabId }) => {
    tabs.goBack(tabId);
    return undefined;
  });
  handle('tab/forward', 'shell', ({ tabId }) => {
    tabs.goForward(tabId);
    return undefined;
  });
  handle('tab/reload', 'shell', ({ tabId, ignoreCache }) => {
    tabs.reload(tabId, ignoreCache ?? false);
    return undefined;
  });
  handle('tab/stop', 'shell', ({ tabId }) => {
    tabs.stop(tabId);
    return undefined;
  });
  handle('tab/close', 'shell', ({ tabId }) => {
    tabs.close(tabId);
    return undefined;
  });
  handle('tab/reopenClosed', 'shell', () => tabs.reopenClosed());
  handle('tab/setMuted', 'shell', ({ tabId, muted }) => {
    tabs.setMuted(tabId, muted);
    return undefined;
  });
  handle('tab/setZoom', 'shell', ({ tabId, zoom }) => tabs.setZoom(tabId, zoom));
  handle('tab/sleep', 'shell', async ({ tabId }) => {
    await tabs.sleep(tabId);
    return undefined;
  });
  handle('tab/wake', 'shell', ({ tabId }) => {
    tabs.wake(tabId);
    return undefined;
  });
  handle('tab/devtools', 'shell', ({ tabId }) => {
    tabs.toggleDevTools(tabId);
    return undefined;
  });
  handle('tab/preview', 'shell', async ({ tabId, width }) => ({
    tabId,
    dataUrl: await tabs.capture(tabId, width),
  }));

  handle('layout/set', 'shell', (layout) => {
    windows.setLayout(layout);
    return undefined;
  });
  handle('window/action', 'shell', ({ action }) => {
    const win = windows.main?.win;
    if (!win) return undefined;
    switch (action) {
      case 'minimize':
        win.minimize();
        break;
      case 'maximize':
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        break;
      case 'close':
        win.close();
        break;
      case 'fullscreen':
        win.setFullScreen(!win.isFullScreen());
        break;
      case 'new':
      case 'little':
        runCommand(ctx, 'littleWindow');
        break;
    }
    return undefined;
  });
  handle('window/isFullscreen', 'shell', () => windows.main?.win.isFullScreen() ?? false);

  handle('overlay/show', 'shell', ({ kind, payload }) => {
    overlay.show(kind, payload);
    return undefined;
  });
  handle('overlay/hide', 'shell', () => {
    overlay.hide();
    return undefined;
  });

  handle('perf/mark', 'shell', ({ name, at }) => {
    ctx.perf[name] = at;
    return undefined;
  });
  handle('perf/marks', 'internal', () => ({ ...ctx.perf }));
  // Unreserved shortcuts forwarded by the tab preload once the page declined them.
  ipcMain.on(channel('shortcut'), (event, id: unknown) => {
    if (typeof id !== 'string' || !UNRESERVED_IDS.has(id)) return;
    const senderIsTab = tabs.liveTabIds().some((t) => tabs.webContents(t)?.id === event.sender.id);
    if (!senderIsTab && !isTrustedShell(event.sender)) return;
    runCommand(ctx, id);
  });
  handle('command/run', 'shell', ({ id, payload }) => {
    runCommand(ctx, id, payload);
    return undefined;
  });
  handle('menu/show', 'shell', ({ kind, id }, event) => {
    showSidebarMenu(ctx, kind, id, event.sender);
    return undefined;
  });
  handle('tab/find', 'shell', (req) => {
    findInTab(ctx, req);
    return undefined;
  });
  handle('tab/stopFind', 'shell', ({ tabId, action }) => {
    stopFind(ctx, tabId, action);
    return undefined;
  });
  handle('suggest/query', 'shell', ({ query }) => fetchSuggestions(prefs.value.searchEngineId, query));
  handle('peek/open', 'shell', ({ url, fromTabId }) => {
    ctx.peek.open(url, fromTabId);
    return undefined;
  });
  handle('peek/action', 'shell', ({ action }) => {
    ctx.peek.action(action);
    return undefined;
  });
  handle('little/state', 'shell', (_req, event) => windows.littleFor(event.sender.id)?.state ?? null);
  handle('little/action', 'shell', ({ action, input }, event) => {
    const little = windows.littleFor(event.sender.id);
    if (!little) return undefined;
    if (action === 'navigate') little.navigate(input ?? '');
    else little.action(action);
    return undefined;
  });
  handle('little/sendToMain', 'shell', ({ spaceId }, event) => {
    windows.littleFor(event.sender.id)?.sendToMain(spaceId);
    return undefined;
  });

  handle('history/search', 'internal', ({ query, limit, offset }) =>
    ctx.history.search(query, limit ?? 50, offset ?? 0),
  );
  handle('history/delete', 'internal', (opts) => {
    ctx.history.delete(opts);
    return undefined;
  });
  handle('archive/search', 'internal', ({ query, limit }) => {
    const q = query.trim().toLowerCase();
    const list = q
      ? store.state.archive.filter(
          (a) => a.title.toLowerCase().includes(q) || a.url.toLowerCase().includes(q),
        )
      : store.state.archive;
    return list.slice(0, limit ?? 200);
  });

  handle('downloads/list', 'internal', () => ctx.downloads.list());
  handle('downloads/action', 'internal', ({ id, action }) => {
    ctx.downloads.action(id, action);
    return undefined;
  });
  handle('downloads/clear', 'internal', () => {
    ctx.downloads.clearFinished();
    return undefined;
  });

  handle('permissions/list', 'internal', () => ctx.permissions.list());
  handle('permissions/set', 'internal', (p) => {
    ctx.permissions.set(p);
    return undefined;
  });
  handle('permissions/remove', 'internal', ({ origin, permission }) => {
    ctx.permissions.remove(origin, permission);
    return undefined;
  });
  handle('permissions/respond', 'shell', ({ id, decision, remember }) => {
    ctx.permissions.respond(id, decision, remember);
    return undefined;
  });
  handle('auth/respond', 'shell', ({ id, username, password }) => {
    ctx.auth.respond(id, username, password);
    return undefined;
  });
  handle('external/respond', 'shell', ({ id, allow, remember }) => {
    ctx.external.respond(id, allow, remember);
    return undefined;
  });
  handle('tab/openPath', 'shell', ({ path }) => {
    if (!path.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(path)) return null;
    return tabs.openRaw(pathToFileURL(path).toString());
  });
  handle('downloads/pickDir', 'internal', async () => {
    const win = windows.main?.win;
    const opts: Electron.OpenDialogOptions = {
      title: 'Download folder',
      properties: ['openDirectory', 'createDirectory'],
    };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    const dir = res.canceled ? null : (res.filePaths[0] ?? null);
    if (dir) prefs.set({ downloadDir: dir });
    return dir;
  });
  handle('tab/print', 'internal', ({ tabId }) => {
    tabs.print(tabId);
    return undefined;
  });
  handle('tab/savePage', 'internal', ({ tabId }) => savePageAs(ctx, tabId));
  handle('app/openFile', 'internal', () => openLocalFile(ctx));
  handle('app/defaultBrowser', 'internal', ({ set }) => {
    if (set) {
      app.setAsDefaultProtocolClient('http');
      app.setAsDefaultProtocolClient('https');
    }
    return app.isDefaultProtocolClient('http') && app.isDefaultProtocolClient('https');
  });
  // Clearing is per session so every profile (and the shell's default session) is covered.
  handle('privacy/clear', 'internal', async (req) => {
    const storages: Electron.ClearStorageDataOptions['storages'] = [];
    if (req.cookies) storages.push('cookies');
    if (req.storage) storages.push('localstorage', 'indexdb', 'filesystem', 'serviceworkers', 'cachestorage');
    const sessions = [
      session.defaultSession,
      ...ctx.sessions.allPartitions().map((p) => session.fromPartition(p)),
    ];
    await Promise.all(
      sessions.map(async (ses) => {
        if (storages.length) await ses.clearStorageData({ storages }).catch(() => undefined);
        if (req.cache) await ses.clearCache().catch(() => undefined);
        if (req.cookies) await ses.clearAuthCache().catch(() => undefined);
      }),
    );
    if (req.history) ctx.history.delete({ all: true });
    if (req.downloads) ctx.downloads.clearFinished();
    return undefined;
  });

  handle('boosts/list', 'internal', () => ctx.boosts.list());
  handle('boosts/save', 'internal', async (b) => {
    ctx.boosts.save(b);
    await ctx.boosts.refresh(liveContents(), b.host);
    return undefined;
  });
  handle('boosts/delete', 'internal', async ({ id }) => {
    const host = ctx.boosts.list().find((b) => b.id === id)?.host;
    ctx.boosts.delete(id);
    if (host) await ctx.boosts.refresh(liveContents(), host);
    return undefined;
  });
  handle('boosts/zap', 'shell', async ({ tabId, enable }) => {
    const wc = tabs.webContents(tabId);
    if (wc && enable) {
      const selector = await ctx.boosts.zap(wc);
      const shellWc = windows.main?.win.webContents;
      if (selector && shellWc) emit(shellWc, 'zap/pick', { tabId, selector });
    }
    return undefined;
  });
  handle('boosts/export', 'internal', () => ctx.boosts.exportJson());
  handle('boosts/import', 'internal', ({ json }) => ctx.boosts.importJson(json));

  handle('blocker/stats', 'internal', ({ tabId }) => {
    const wc = tabs.webContents(tabId);
    const tab = store.state.tabs[tabId];
    return ctx.blocker.stats(wc?.getURL() || tab?.url || '', wc?.id);
  });
  handle('blocker/setHost', 'internal', ({ host, enabled }) => {
    ctx.blocker.setHostEnabled(host, enabled);
    return undefined;
  });
  handle('tab/reader', 'internal', async ({ tabId }) => {
    const wc = tabs.webContents(tabId);
    return wc ? extractReadable(wc) : null;
  });

  handle('extensions/list', 'internal', () => ctx.extensions.list());
  handle('extensions/load', 'internal', ({ path }, event) =>
    path && isTrustedShell(event.sender)
      ? ctx.extensions.load(path)
      : ctx.extensions.pickAndLoad(windows.main?.win),
  );
  handle('extensions/remove', 'internal', ({ id }) => {
    ctx.extensions.remove(id);
    return undefined;
  });
  handle('extensions/popup', 'internal', ({ id }) => {
    const url = ctx.extensions.popupUrl(id);
    if (!url) return false;
    ctx.peek.open(url, tabs.activeTabId() ?? undefined);
    return true;
  });
  handle('theme/fromImage', 'shell', () => pickImageAndExtract(windows.main?.win));
  handle('theme/fromImagePath', 'shell', ({ path }) => paletteFromFile(path));

  handle('certificate/trust', 'internal', ({ fingerprint }) => {
    tabs.trustedCertificates.add(fingerprint);
    return undefined;
  });

  handle('import/sources', 'internal', () => detectSources());
  handle('import/run', 'internal', ({ source, bookmarks, history }) =>
    runImport(ctx, source, bookmarks, history),
  );
  handle('export/state', 'internal', () => exportState(ctx));
  handle('export/saveToFile', 'internal', () => saveExportToFile(ctx));
  handle('import/state', 'internal', ({ json }) => {
    importState(ctx, json);
    return undefined;
  });
  handle('import/fromFile', 'internal', () => importFromFile(ctx));

  handle('update/status', 'internal', () => ctx.updater.status);
  handle('update/check', 'internal', () => ctx.updater.check());
  handle('update/install', 'internal', () => {
    ctx.updater.install();
    return undefined;
  });

  handle('app/openExternal', 'internal', async ({ url }) => {
    if (/^(https?|mailto):/i.test(url)) await shell.openExternal(url);
    return undefined;
  });
  handle('app/relaunch', 'internal', () => {
    app.relaunch();
    flushStateNow();
    app.exit(0);
    return undefined;
  });

  const wireWindow = (mw: NonNullable<typeof windows.main>): void => {
    mw.win.webContents.on('render-process-gone', (_e, d) => {
      if (d.reason !== 'clean-exit') mw.win.webContents.reload();
    });
    mw.win.on('enter-full-screen', () => emit(mw.win.webContents, 'window/fullscreen', true));
    mw.win.on('leave-full-screen', () => emit(mw.win.webContents, 'window/fullscreen', false));
    mw.win.on('closed', () => {
      ctx.peek.close();
      tabs.destroyAll();
      overlay.destroy();
    });
  };
  windows.setWindowCreatedListener(wireWindow);
  if (windows.main) wireWindow(windows.main);
}
