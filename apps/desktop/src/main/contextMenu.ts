import { displayTitle, type Id } from '@vela/core';
import type { ContextMenuKind } from '@vela/shared';
import { clipboard, Menu, shell, type MenuItemConstructorOptions, type WebContents } from 'electron';
import type { AppContext } from './context';
import { emit } from './ipc/typed';

function toShell(ctx: AppContext, id: string, payload?: unknown): void {
  const wc = ctx.windows.main?.win.webContents;
  if (wc) emit(wc, 'ui/command', { id, payload });
}

function moveToSpaceItems(ctx: AppContext, tabId: Id): MenuItemConstructorOptions[] {
  const { state } = ctx.store;
  const tab = state.tabs[tabId];
  return state.spaceOrder
    .filter((sid) => sid !== tab?.spaceId)
    .map((sid) => {
      const sp = state.spaces[sid];
      return {
        label: `${sp?.emoji ?? ''} ${sp?.name ?? sid}`.trim(),
        click: () =>
          ctx.store.dispatch({
            type: 'tab/move',
            id: tabId,
            to: { container: { kind: 'today', spaceId: sid }, index: 0 },
            now: Date.now(),
          }),
      };
    });
}

export function sidebarMenu(ctx: AppContext, kind: ContextMenuKind, id?: Id): MenuItemConstructorOptions[] {
  const { store, tabs } = ctx;
  const state = store.state;
  const now = Date.now();
  const space = state.spaces[state.activeSpaceId];

  if ((kind === 'tab' || kind === 'favorite') && id) {
    const tab = state.tabs[id];
    if (!tab) return [];
    const isPinned = tab.kind === 'pinned';
    const isFav = tab.kind === 'favorite';
    return [
      { label: 'Rename…', click: () => toShell(ctx, 'renameItem', { id }) },
      { label: 'Change icon…', click: () => toShell(ctx, 'pickIcon', { id }) },
      { type: 'separator' },
      isFav
        ? {
            label: 'Remove from Favorites',
            click: () =>
              store.dispatch({
                type: 'tab/move',
                id,
                to: { container: { kind: 'today', spaceId: state.activeSpaceId }, index: 0 },
                now,
              }),
          }
        : { label: 'Add to Favorites', click: () => store.dispatch({ type: 'tab/favorite', id }) },
      isPinned
        ? { label: 'Unpin', click: () => store.dispatch({ type: 'tab/unpin', id, now }) }
        : isFav
          ? { label: 'Pin to this space', click: () => store.dispatch({ type: 'tab/pin', id }) }
          : { label: 'Pin', click: () => store.dispatch({ type: 'tab/pin', id }) },
      {
        label: 'Move to space',
        submenu: moveToSpaceItems(ctx, id),
        enabled: !isFav && state.spaceOrder.length > 1,
      },
      { type: 'separator' },
      {
        label: 'Open in split view',
        enabled: !!space && space.activeTabId !== id,
        click: () => store.dispatch({ type: 'split/add', spaceId: state.activeSpaceId, tabId: id }),
      },
      { label: 'Open in Little window', click: () => ctx.openLittle(tab.url) },
      { label: 'Duplicate', click: () => tabs.openUrl({ input: tab.url, activate: true, noAtc: true }) },
      {
        label: 'Copy link',
        click: () => {
          void clipboard.writeText(tab.url);
        },
      },
      { type: 'separator' },
      { label: tab.muted ? 'Unmute' : 'Mute', click: () => tabs.setMuted(id, !tab.muted) },
      {
        label: 'Always keep active',
        type: 'checkbox',
        checked: tab.alwaysActive,
        click: () => store.dispatch({ type: 'tab/update', id, patch: { alwaysActive: !tab.alwaysActive } }),
      },
      { label: 'Put to sleep', enabled: tab.loaded && !tab.sleeping, click: () => void tabs.sleep(id) },
      { type: 'separator' },
      { label: isPinned || isFav ? 'Reset to original URL' : 'Archive', click: () => tabs.close(id) },
      ...(isPinned || isFav
        ? [
            {
              label: 'Remove',
              click: () => store.dispatch({ type: 'tab/close', id, now, reason: 'closed' as const }),
            },
          ]
        : []),
    ];
  }

  if (kind === 'folder' && id) {
    const folder = state.folders[id];
    if (!folder) return [];
    return [
      { label: 'Rename…', click: () => toShell(ctx, 'renameItem', { id }) },
      { label: 'Change icon…', click: () => toShell(ctx, 'pickIcon', { id }) },
      { label: 'New folder inside', click: () => toShell(ctx, 'newFolder', { parentFolderId: id }) },
      { type: 'separator' },
      { label: 'Delete folder (keep tabs)', click: () => store.dispatch({ type: 'folder/delete', id }) },
    ];
  }

  if (kind === 'space') {
    const sid = id ?? state.activeSpaceId;
    return [
      { label: 'Edit space…', click: () => ctx.overlay.show('spaceEditor', { spaceId: sid }) },
      { label: 'New space', click: () => ctx.overlay.show('spaceEditor', { spaceId: 'new' }) },
      { label: 'New folder', click: () => toShell(ctx, 'newFolder', {}) },
      { type: 'separator' },
      {
        label: 'Clear Today tabs',
        click: () => {
          for (const tid of [...(state.spaces[sid]?.today ?? [])]) {
            store.dispatch({ type: 'tab/close', id: tid, now, reason: 'closed' });
          }
        },
      },
      {
        label: 'Delete space',
        enabled: state.spaceOrder.length > 1,
        click: () => store.dispatch({ type: 'space/delete', id: sid, now }),
      },
    ];
  }

  if (kind === 'pinnedArea' || kind === 'today') {
    return [{ label: 'New folder', click: () => toShell(ctx, 'newFolder', {}) }];
  }
  return [];
}

export function showSidebarMenu(
  ctx: AppContext,
  kind: ContextMenuKind,
  id: Id | undefined,
  wc: WebContents,
): void {
  const template = sidebarMenu(ctx, kind, id);
  if (template.length === 0) return;
  const win = ctx.windows.main?.win;
  if (!win) return;
  Menu.buildFromTemplate(template).popup({ window: win });
  void wc;
}

/** Right-click inside web content. */
export function installPageContextMenu(ctx: AppContext): void {
  ctx.tabs.onViewCreated((tabId, wc) => {
    wc.on('context-menu', (_e, params) => {
      const items: MenuItemConstructorOptions[] = [];
      const tab = ctx.store.state.tabs[tabId];
      if (params.linkURL) {
        items.push(
          {
            label: 'Open link in new tab',
            click: () =>
              ctx.tabs.openUrl({
                input: params.linkURL,
                activate: false,
                noAtc: true,
                ...(tab?.spaceId ? { spaceId: tab.spaceId } : {}),
              }),
          },
          {
            label: 'Open link in split view',
            click: () => {
              const id = ctx.tabs.openUrl({ input: params.linkURL, activate: true, noAtc: true });
              ctx.store.dispatch({ type: 'split/add', spaceId: ctx.store.state.activeSpaceId, tabId: id });
            },
          },
          { label: 'Open link in Little window', click: () => ctx.openLittle(params.linkURL) },
          { label: 'Peek link', click: () => ctx.peek.open(params.linkURL, tabId) },
          {
            label: 'Copy link',
            click: () => {
              void clipboard.writeText(params.linkURL);
            },
          },
          { type: 'separator' },
        );
      }
      if (params.mediaType === 'image' && params.srcURL) {
        items.push(
          {
            label: 'Open image in new tab',
            click: () => ctx.tabs.openUrl({ input: params.srcURL, activate: true, noAtc: true }),
          },
          { label: 'Copy image', click: () => wc.copyImageAt(params.x, params.y) },
          { label: 'Save image as…', click: () => wc.downloadURL(params.srcURL) },
          { type: 'separator' },
        );
      }
      if (params.selectionText.trim()) {
        const text = params.selectionText.trim();
        const short = text.length > 32 ? `${text.slice(0, 32)}…` : text;
        items.push(
          { label: 'Copy', role: 'copy' },
          { label: `Search for “${short}”`, click: () => ctx.tabs.openUrl({ input: text, activate: true }) },
          { type: 'separator' },
        );
      }
      if (params.isEditable) {
        items.push(
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
          { type: 'separator' },
        );
        for (const s of params.dictionarySuggestions.slice(0, 5)) {
          items.unshift({ label: s, click: () => wc.replaceMisspelling(s) });
        }
        if (params.misspelledWord) {
          items.unshift({ type: 'separator' });
          items.unshift({
            label: 'Add to dictionary',
            click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord),
          });
        }
      }
      items.push(
        {
          label: 'Back',
          enabled: wc.navigationHistory.canGoBack(),
          click: () => wc.navigationHistory.goBack(),
        },
        {
          label: 'Forward',
          enabled: wc.navigationHistory.canGoForward(),
          click: () => wc.navigationHistory.goForward(),
        },
        { label: 'Reload', click: () => wc.reload() },
        { type: 'separator' },
        {
          label: 'Copy page link',
          click: () => {
            void clipboard.writeText(wc.getURL());
          },
        },
        {
          label: 'Open in external browser',
          enabled: /^https?:/i.test(wc.getURL()),
          click: () => {
            const u = wc.getURL();
            if (/^https?:/i.test(u)) void shell.openExternal(u);
          },
        },
        { type: 'separator' },
        { label: 'Zap element…', click: () => void ctx.boosts.zap(wc) },
        { label: 'Reader mode', click: () => toShell(ctx, 'readerMode', { tabId }) },
        { type: 'separator' },
        { label: 'Inspect element', click: () => wc.inspectElement(params.x, params.y) },
      );
      const win = ctx.windows.main?.win;
      Menu.buildFromTemplate(items).popup(win ? { window: win } : {});
    });
    void displayTitle;
  });
}
