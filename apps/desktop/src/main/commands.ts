import { activeSpace, createSpace, SPACE_PRESET_THEMES, type Id } from '@vela/core';
import { dialog } from 'electron';
import { pathToFileURL } from 'node:url';
import type { AppContext } from './context';
import { emit } from './ipc/typed';

/** Commands triggered by menu accelerators, the command bar or the shell. Runs in main. */
let switcherSeq = 0;

export function runCommand(ctx: AppContext, id: string, payload?: unknown): void {
  const { store, tabs, overlay, windows } = ctx;
  const state = store.state;
  const space = activeSpace(state);
  const activeId = space?.activeTabId ?? null;
  const toShell = (cmd: string, p?: unknown): void => {
    const wc = windows.main?.win.webContents;
    if (wc) emit(wc, 'ui/command', { id: cmd, payload: p });
  };
  const now = Date.now();

  switch (id) {
    case 'newTab':
      overlay.toggle('commandBar', { mode: 'new' });
      return;
    case 'editUrl':
      overlay.show('commandBar', { mode: 'edit', tabId: activeId });
      return;
    case 'closeTab':
      if (overlay.visible) overlay.hide();
      else tabs.closeActive();
      return;
    case 'reopenTab':
      tabs.reopenClosed();
      return;
    case 'pinTab': {
      const tab = activeId ? state.tabs[activeId] : undefined;
      if (!tab) return;
      if (tab.kind === 'today') store.dispatch({ type: 'tab/pin', id: tab.id });
      else store.dispatch({ type: 'tab/unpin', id: tab.id, now });
      return;
    }
    case 'nextTabMru':
      overlay.show('switcher', { direction: 1, seq: ++switcherSeq });
      return;
    case 'prevTabMru':
      overlay.show('switcher', { direction: -1, seq: ++switcherSeq });
      return;
    case 'nextTab':
    case 'prevTab': {
      if (!space) return;
      const list = [...space.pinned.filter((i) => state.tabs[i]), ...space.today];
      if (list.length === 0) return;
      const idx = activeId ? list.indexOf(activeId) : -1;
      const next = list[(idx + (id === 'nextTab' ? 1 : -1) + list.length) % list.length];
      if (next) store.dispatch({ type: 'tab/activate', id: next, now });
      return;
    }
    case 'reload':
      if (activeId) tabs.reload(activeId);
      return;
    case 'hardReload':
      if (activeId) tabs.reload(activeId, true);
      return;
    case 'back':
      if (activeId) tabs.goBack(activeId);
      return;
    case 'forward':
      if (activeId) tabs.goForward(activeId);
      return;
    case 'findInPage':
      toShell('findInPage');
      return;
    case 'zoomIn':
      if (activeId) tabs.zoomBy(activeId, 0.1);
      return;
    case 'zoomOut':
      if (activeId) tabs.zoomBy(activeId, -0.1);
      return;
    case 'zoomReset':
      if (activeId) tabs.zoomBy(activeId, 0);
      return;
    case 'devtools':
      if (activeId) tabs.toggleDevTools(activeId);
      return;
    case 'toggleSidebar':
      toShell('toggleSidebar');
      return;
    case 'splitView':
      overlay.show('commandBar', { mode: 'split' });
      return;
    case 'closeSplit':
      if (space?.split && activeId)
        store.dispatch({ type: 'split/remove', spaceId: space.id, tabId: activeId });
      return;
    case 'fullscreen': {
      const win = windows.main?.win;
      if (win) win.setFullScreen(!win.isFullScreen());
      return;
    }
    case 'spaceNext':
    case 'spacePrev': {
      const idx = state.spaceOrder.indexOf(state.activeSpaceId);
      const n = state.spaceOrder.length;
      const target = state.spaceOrder[(idx + (id === 'spaceNext' ? 1 : -1) + n) % n];
      if (target) store.dispatch({ type: 'space/activate', id: target, now });
      return;
    }
    case 'newSpace': {
      const theme = SPACE_PRESET_THEMES[state.spaceOrder.length % SPACE_PRESET_THEMES.length];
      const sp = createSpace({
        name: `Space ${state.spaceOrder.length + 1}`,
        ...(theme ? { theme } : {}),
        now,
      });
      store.dispatch({ type: 'space/create', space: sp });
      store.dispatch({ type: 'space/activate', id: sp.id, now });
      toShell('editSpace', { spaceId: sp.id });
      return;
    }
    case 'archiveView':
      tabs.openUrl({ input: 'vela://archive', noAtc: true });
      return;
    case 'downloads':
      toShell('toggleDownloads');
      return;
    case 'history':
      tabs.openUrl({ input: 'vela://history', noAtc: true });
      return;
    case 'settings':
      tabs.openUrl({ input: 'vela://settings', noAtc: true });
      return;
    case 'shortcuts':
      tabs.openUrl({ input: 'vela://shortcuts', noAtc: true });
      return;
    case 'readerMode': {
      const tid = (payload as { tabId?: string } | undefined)?.tabId ?? activeId;
      if (tid) ctx.peek.open(`vela://reader/?tab=${encodeURIComponent(tid)}`, tid);
      return;
    }
    case 'print':
      if (activeId) tabs.print(activeId);
      return;
    case 'viewSource': {
      const tab = activeId ? state.tabs[activeId] : undefined;
      if (tab && /^https?:/i.test(tab.url)) tabs.openRaw(`view-source:${tab.url}`);
      return;
    }
    case 'openFile':
      void openLocalFile(ctx);
      return;
    case 'savePage':
      if (activeId) void savePageAs(ctx, activeId);
      return;
    case 'zap': {
      const tid = (payload as { tabId?: string } | undefined)?.tabId ?? activeId;
      if (!tid) return;
      const wc = tabs.webContents(tid);
      if (wc) void ctx.boosts.zap(wc);
      return;
    }
    case 'newWindow':
    case 'littleWindow': {
      const url = (payload as { url?: string } | undefined)?.url ?? 'about:blank';
      ctx.openLittle(url);
      return;
    }
    case 'peek': {
      const p = payload as { url?: string; fromTabId?: string } | undefined;
      if (p?.url) ctx.peek.open(p.url, p.fromTabId);
      return;
    }
    default: {
      const m = /^space(\d)$/.exec(id);
      if (m) {
        const target = state.spaceOrder[Number(m[1]) - 1];
        if (target) store.dispatch({ type: 'space/activate', id: target, now });
        return;
      }
      toShell(id, payload);
    }
  }
}

export async function openLocalFile(ctx: AppContext): Promise<Id | null> {
  const win = ctx.windows.main?.win;
  const opts: Electron.OpenDialogOptions = {
    title: 'Open file',
    properties: ['openFile'],
    filters: [
      {
        name: 'Web pages and documents',
        extensions: ['html', 'htm', 'pdf', 'svg', 'txt', 'md', 'json', 'xml'],
      },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'] },
      { name: 'All files', extensions: ['*'] },
    ],
  };
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  const file = res.canceled ? undefined : res.filePaths[0];
  if (!file) return null;
  return ctx.tabs.openRaw(pathToFileURL(file).toString());
}

export async function savePageAs(ctx: AppContext, tabId: Id): Promise<boolean> {
  const tab = ctx.store.state.tabs[tabId];
  const win = ctx.windows.main?.win;
  if (!tab || !win) return false;
  const base =
    (tab.title || 'page')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .trim()
      .slice(0, 80) || 'page';
  const res = await dialog.showSaveDialog(win, {
    title: 'Save page',
    defaultPath: `${base}.html`,
    filters: [{ name: 'Web page, complete', extensions: ['html'] }],
  });
  if (res.canceled || !res.filePath) return false;
  return ctx.tabs.savePage(tabId, res.filePath);
}
