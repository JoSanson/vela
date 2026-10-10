import type { ShellSnapshot } from '@vela/shared';
import { app, shell } from 'electron';
import { runCommand } from '../commands';
import type { AppContext } from '../context';
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
      little: null,
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
