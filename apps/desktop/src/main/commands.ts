import {
  activeSpace,
  createProfile,
  createSpace,
  displayTitle,
  pinnedTree,
  rootSpaceId,
  SPACE_PRESET_THEMES,
  type Id,
} from '@vela/core';
import { clipboard, dialog } from 'electron';
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
    case 'allSpaces':
      overlay.toggle('spaces');
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
      const idx = state.spaceOrder.indexOf(rootSpaceId(state, state.activeSpaceId));
      const n = state.spaceOrder.length;
      const target = state.spaceOrder[(idx + (id === 'spaceNext' ? 1 : -1) + n) % n];
      if (target) ctx.activateSpace(target);
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
      ctx.activateSpace(sp.id);
      overlay.show('spaceEditor', { spaceId: sp.id });
      return;
    }
    case 'archiveView':
      tabs.openUrl({ input: 'vela://archive', noAtc: true });
      return;
    case 'clearSiteCookies': {
      // Every cookie the current page's host would send (its own and its parent domains'), in this
      // tab's own session only, then a fresh load: the way out of a broken sign-in state.
      const wc = activeId ? tabs.webContents(activeId) : undefined;
      if (!wc || wc.isDestroyed()) return;
      let host: string;
      try {
        host = new URL(wc.getURL()).hostname;
      } catch {
        return;
      }
      if (!host) return;
      const labels = host.split('.');
      const domains = labels.map((_, i) => labels.slice(i).join('.')).filter((d) => d.includes('.'));
      void (async () => {
        const seen = new Set<string>();
        for (const d of domains.length ? domains : [host]) {
          for (const c of await wc.session.cookies.get({ domain: d })) {
            const key = `${c.domain}|${c.path}|${c.name}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const url = `${c.secure ? 'https' : 'http'}://${(c.domain ?? '').replace(/^\./, '')}${c.path ?? '/'}`;
            await wc.session.cookies.remove(url, c.name).catch(() => undefined);
          }
        }
        if (!wc.isDestroyed()) wc.reload();
        overlay.show('toast', {
          text: ctx.i18n.t('overlay.toast.siteCookiesCleared', { host, n: seen.size }),
        });
      })();
      return;
    }
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
      void ctx.openWindow();
      return;
    case 'newPrivateWindow': {
      // A throwaway profile (in-memory partition) on its own Space in its own window: closing the
      // Space drops cookies, logins and history with it.
      const name = ctx.i18n.t('overlay.spaceEditor.privateProfile');
      const profile = createProfile(name, '#52525b', undefined, true);
      store.dispatch({ type: 'profile/create', profile });
      const sp = createSpace({
        name,
        emoji: '🕶️',
        theme: { from: '#3f3f46', to: '#18181b', grain: 0.08, mode: 'dark' },
        profileId: profile.id,
        now,
      });
      store.dispatch({ type: 'space/create', space: sp });
      void ctx.openWindow(sp.id);
      return;
    }
    case 'copyUrl':
    case 'copyUrlMarkdown': {
      const tab = activeId ? state.tabs[activeId] : undefined;
      if (!tab || !/^https?:/i.test(tab.url)) return;
      void clipboard.writeText(id === 'copyUrl' ? tab.url : `[${displayTitle(tab)}](${tab.url})`);
      overlay.show('toast', { text: ctx.i18n.t('overlay.toast.urlCopied') });
      return;
    }
    case 'clearToday': {
      if (!space) return;
      for (const tid of [...space.today]) tabs.close(tid);
      return;
    }
    case 'stop': {
      const wc = activeId ? tabs.webContents(activeId) : undefined;
      if (wc && !wc.isDestroyed()) wc.stop();
      return;
    }
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
      const tabN = /^tab(\d)$/.exec(id);
      if (tabN && space) {
        const order = [
          ...pinnedTree(state, space.id)
            .filter((i): i is Extract<typeof i, { kind: 'tab' }> => i.kind === 'tab')
            .map((i) => i.tab.id),
          ...space.today,
        ];
        const target = order[Number(tabN[1]) - 1];
        if (target) store.dispatch({ type: 'tab/activate', id: target, now });
        return;
      }
      const splitN = /^split(\d)$/.exec(id);
      if (splitN && space?.split) {
        const pane = space.split.panes[Number(splitN[1]) - 1];
        if (pane) store.dispatch({ type: 'tab/activate', id: pane, now });
        return;
      }
      const m = /^space(\d)$/.exec(id);
      if (m) {
        const target = state.spaceOrder[Number(m[1]) - 1];
        if (target) ctx.activateSpace(target);
        return;
      }
      toShell(id, payload);
    }
  }
}

export async function openLocalFile(ctx: AppContext): Promise<Id | null> {
  const win = ctx.windows.main?.win;
  const t = ctx.i18n.t;
  const opts: Electron.OpenDialogOptions = {
    title: t('menu.dialog.openFile'),
    properties: ['openFile'],
    filters: [
      {
        name: t('menu.dialog.filterWebPages'),
        extensions: ['html', 'htm', 'pdf', 'svg', 'txt', 'md', 'json', 'xml'],
      },
      { name: t('menu.dialog.filterImages'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'] },
      { name: t('menu.dialog.filterAll'), extensions: ['*'] },
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
  const t = ctx.i18n.t;
  const res = await dialog.showSaveDialog(win, {
    title: t('menu.dialog.savePage'),
    defaultPath: `${base}.html`,
    filters: [{ name: t('menu.dialog.filterWebPageComplete'), extensions: ['html'] }],
  });
  if (res.canceled || !res.filePath) return false;
  return ctx.tabs.savePage(tabId, res.filePath);
}
