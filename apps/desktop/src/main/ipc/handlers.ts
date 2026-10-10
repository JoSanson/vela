import type { ShellSnapshot } from '@vela/shared';
import { app, shell } from 'electron';
import { runCommand } from '../commands';
import type { AppContext } from '../context';
import { showSidebarMenu } from '../contextMenu';
import { findInTab, stopFind } from '../find';
import { fetchSuggestions } from '../suggest';
import { emit, handle } from './typed';

export function registerCoreHandlers(ctx: AppContext): void {
  const { store, prefs, tabs, windows, overlay } = ctx;

  handle('snapshot/get', 'internal', (_req, event): ShellSnapshot => {
    return {
      state: store.state,
      prefs: prefs.value,
      version: ctx.version,
      platform: process.platform as ShellSnapshot['platform'],
      windowId: event.sender.id,
      overlay: overlay.current,
      little: windows.littleFor(event.sender.id) ? { tabId: 'little' } : null,
    };
  });

  handle('state/dispatch', 'shell', (action) => {
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

  handle('app/openExternal', 'shell', async ({ url }) => {
    if (/^(https?|mailto):/i.test(url)) await shell.openExternal(url);
    return undefined;
  });
  handle('app/relaunch', 'internal', () => {
    app.relaunch();
    app.exit(0);
    return undefined;
  });

  const winWc = windows.main?.win.webContents;
  if (winWc) {
    windows.main?.win.on('enter-full-screen', () => emit(winWc, 'window/fullscreen', true));
    windows.main?.win.on('leave-full-screen', () => emit(winWc, 'window/fullscreen', false));
  }
}
