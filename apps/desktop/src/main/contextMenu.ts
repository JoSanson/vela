import { displayTitle, type Id } from '@vela/core';
import type { ContextMenuKind } from '@vela/shared';
import { clipboard, Menu, shell, type MenuItemConstructorOptions, type WebContents } from 'electron';
import { savePageAs } from './commands';
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
  const t = ctx.i18n.t;
  const state = store.state;
  const now = Date.now();
  const space = state.spaces[state.activeSpaceId];

  if ((kind === 'tab' || kind === 'favorite') && id) {
    const tab = state.tabs[id];
    if (!tab) return [];
    const isPinned = tab.kind === 'pinned';
    const isFav = tab.kind === 'favorite';
    return [
      { label: t('menu.context.rename'), click: () => toShell(ctx, 'renameItem', { id }) },
      { label: t('menu.context.changeIcon'), click: () => toShell(ctx, 'pickIcon', { id }) },
      { type: 'separator' },
      isFav
        ? {
            label: t('menu.context.removeFromFavorites'),
            click: () =>
              store.dispatch({
                type: 'tab/move',
                id,
                to: { container: { kind: 'today', spaceId: state.activeSpaceId }, index: 0 },
                now,
              }),
          }
        : {
            label: t('menu.context.addToFavorites'),
            click: () => store.dispatch({ type: 'tab/favorite', id }),
          },
      isPinned
        ? { label: t('menu.context.unpin'), click: () => store.dispatch({ type: 'tab/unpin', id, now }) }
        : isFav
          ? { label: t('menu.context.pinToSpace'), click: () => store.dispatch({ type: 'tab/pin', id }) }
          : { label: t('menu.context.pin'), click: () => store.dispatch({ type: 'tab/pin', id }) },
      {
        label: t('menu.context.moveToSpace'),
        submenu: moveToSpaceItems(ctx, id),
        enabled: !isFav && state.spaceOrder.length > 1,
      },
      { type: 'separator' },
      {
        label: t('menu.context.openInSplit'),
        enabled: !!space && space.activeTabId !== id,
        click: () => store.dispatch({ type: 'split/add', spaceId: state.activeSpaceId, tabId: id }),
      },
      { label: t('menu.context.openInLittle'), click: () => ctx.openLittle(tab.url) },
      {
        label: t('menu.context.duplicate'),
        click: () => tabs.openUrl({ input: tab.url, activate: true, noAtc: true }),
      },
      {
        label: t('menu.context.copyLink'),
        click: () => {
          void clipboard.writeText(tab.url);
        },
      },
      { type: 'separator' },
      {
        label: tab.muted ? t('menu.context.unmute') : t('menu.context.mute'),
        click: () => tabs.setMuted(id, !tab.muted),
      },
      {
        label: t('menu.context.alwaysActive'),
        type: 'checkbox',
        checked: tab.alwaysActive,
        click: () => store.dispatch({ type: 'tab/update', id, patch: { alwaysActive: !tab.alwaysActive } }),
      },
      {
        label: t('menu.context.sleep'),
        enabled: tab.loaded && !tab.sleeping,
        click: () => void tabs.sleep(id),
      },
      { type: 'separator' },
      {
        label: isPinned || isFav ? t('menu.context.resetUrl') : t('menu.context.archive'),
        click: () => tabs.close(id),
      },
      ...(isPinned || isFav
        ? [
            {
              label: t('common.remove'),
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
      { label: t('menu.context.rename'), click: () => toShell(ctx, 'renameItem', { id }) },
      { label: t('menu.context.changeIcon'), click: () => toShell(ctx, 'pickIcon', { id }) },
      {
        label: t('menu.context.newFolderInside'),
        click: () => toShell(ctx, 'newFolder', { parentFolderId: id }),
      },
      { type: 'separator' },
      { label: t('menu.context.deleteFolder'), click: () => store.dispatch({ type: 'folder/delete', id }) },
    ];
  }

  if (kind === 'space') {
    const sid = id ?? state.activeSpaceId;
    return [
      { label: t('menu.context.editSpace'), click: () => ctx.overlay.show('spaceEditor', { spaceId: sid }) },
      { label: t('menu.context.newSpace'), click: () => ctx.overlay.show('spaceEditor', { spaceId: 'new' }) },
      { label: t('menu.context.newFolder'), click: () => toShell(ctx, 'newFolder', {}) },
      { type: 'separator' },
      {
        label: t('menu.context.clearToday'),
        click: () => {
          for (const tid of [...(state.spaces[sid]?.today ?? [])]) {
            store.dispatch({ type: 'tab/close', id: tid, now, reason: 'closed' });
          }
        },
      },
      {
        label: t('menu.context.deleteSpace'),
        enabled: state.spaceOrder.length > 1,
        click: () => store.dispatch({ type: 'space/delete', id: sid, now }),
      },
    ];
  }

  if (kind === 'pinnedArea' || kind === 'today') {
    return [{ label: t('menu.context.newFolder'), click: () => toShell(ctx, 'newFolder', {}) }];
  }

  if (kind === 'urlPill') {
    const url = space?.activeTabId ? state.tabs[space.activeTabId]?.url : undefined;
    return [
      {
        label: t('menu.context.copyUrl'),
        enabled: !!url,
        click: () => {
          if (url) void clipboard.writeText(url);
        },
      },
      {
        label: t('menu.context.pasteAndGo'),
        click: () => {
          void Promise.resolve(clipboard.readText()).then((text) => {
            const pasted = text.trim();
            if (!pasted) return;
            if (space?.activeTabId) tabs.navigate(space.activeTabId, pasted);
            else tabs.openUrl({ input: pasted });
          });
        },
      },
      { type: 'separator' },
      {
        label: t('menu.context.editUrl'),
        click: () => ctx.overlay.show('commandBar', { mode: 'edit', tabId: space?.activeTabId ?? null }),
      },
    ];
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
      const t = ctx.i18n.t;
      const items: MenuItemConstructorOptions[] = [];
      const tab = ctx.store.state.tabs[tabId];
      if (params.linkURL) {
        items.push(
          {
            label: t('menu.context.openLinkNewTab'),
            click: () =>
              ctx.tabs.openUrl({
                input: params.linkURL,
                activate: false,
                noAtc: true,
                ...(tab?.spaceId ? { spaceId: tab.spaceId } : {}),
              }),
          },
          {
            label: t('menu.context.openLinkSplit'),
            click: () => {
              const id = ctx.tabs.openUrl({ input: params.linkURL, activate: true, noAtc: true });
              ctx.store.dispatch({ type: 'split/add', spaceId: ctx.store.state.activeSpaceId, tabId: id });
            },
          },
          { label: t('menu.context.openLinkLittle'), click: () => ctx.openLittle(params.linkURL) },
          { label: t('menu.context.peekLink'), click: () => ctx.peek.open(params.linkURL, tabId) },
          {
            label: t('menu.context.copyLink'),
            click: () => {
              void clipboard.writeText(params.linkURL);
            },
          },
          {
            label: t('menu.context.copyLinkText'),
            enabled: !!params.linkText,
            click: () => {
              void clipboard.writeText(params.linkText);
            },
          },
          ...(/^mailto:/i.test(params.linkURL)
            ? [
                {
                  label: t('menu.context.copyEmail'),
                  click: () => {
                    void clipboard.writeText(params.linkURL.replace(/^mailto:/i, '').split('?')[0] ?? '');
                  },
                },
              ]
            : [{ label: t('menu.context.saveLinkAs'), click: () => wc.downloadURL(params.linkURL) }]),
          { type: 'separator' },
        );
      }
      if (params.mediaType === 'video') {
        items.push(
          {
            label: t('menu.context.pictureInPicture'),
            click: () =>
              void wc
                .executeJavaScript(
                  `(() => { const el = document.elementFromPoint(${params.x}, ${params.y}); const v = el && (el.tagName === 'VIDEO' ? el : el.querySelector('video')); if (v) v.requestPictureInPicture().catch(() => undefined); })()`,
                  true,
                )
                .catch(() => undefined),
          },
          {
            label: t('menu.context.copyVideoAddress'),
            enabled: !!params.srcURL,
            click: () => {
              void clipboard.writeText(params.srcURL);
            },
          },
          { type: 'separator' },
        );
      }
      if (params.mediaType === 'image' && params.srcURL) {
        items.push(
          {
            label: t('menu.context.openImageNewTab'),
            click: () => ctx.tabs.openUrl({ input: params.srcURL, activate: true, noAtc: true }),
          },
          { label: t('menu.context.openImagePeek'), click: () => ctx.peek.open(params.srcURL, tabId) },
          { label: t('menu.context.copyImage'), click: () => wc.copyImageAt(params.x, params.y) },
          {
            label: t('menu.context.copyImageAddress'),
            click: () => {
              void clipboard.writeText(params.srcURL);
            },
          },
          { label: t('menu.context.saveImageAs'), click: () => wc.downloadURL(params.srcURL) },
          { type: 'separator' },
        );
      }
      if (params.selectionText.trim()) {
        const text = params.selectionText.trim();
        const short = text.length > 32 ? `${text.slice(0, 32)}…` : text;
        items.push(
          { label: t('common.copy'), role: 'copy' },
          {
            label: t('menu.context.searchFor', { query: short }),
            click: () => ctx.tabs.openUrl({ input: text, activate: true }),
          },
          {
            label: t('menu.context.translateSelection'),
            click: () =>
              ctx.peek.open(
                `https://translate.google.com/?sl=auto&tl=${t.locale}&text=${encodeURIComponent(text)}&op=translate`,
                tabId,
              ),
          },
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
            label: t('menu.context.addToDictionary'),
            click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord),
          });
        }
      }
      items.push(
        {
          label: t('common.back'),
          enabled: wc.navigationHistory.canGoBack(),
          click: () => wc.navigationHistory.goBack(),
        },
        {
          label: t('menu.context.forward'),
          enabled: wc.navigationHistory.canGoForward(),
          click: () => wc.navigationHistory.goForward(),
        },
        { label: t('menu.context.reload'), click: () => wc.reload() },
        { type: 'separator' },
        { label: t('menu.context.selectAll'), role: 'selectAll' },
        {
          label: t('menu.context.copyPageLink'),
          click: () => {
            void clipboard.writeText(wc.getURL());
          },
        },
        {
          label: t('menu.context.openExternal'),
          enabled: /^https?:/i.test(wc.getURL()),
          click: () => {
            const u = wc.getURL();
            if (/^https?:/i.test(u)) void shell.openExternal(u);
          },
        },
        { type: 'separator' },
        { label: t('menu.context.zap'), click: () => void ctx.boosts.zap(wc) },
        { label: t('menu.context.readerMode'), click: () => toShell(ctx, 'readerMode', { tabId }) },
        {
          label: t('menu.context.translatePage'),
          enabled: /^https?:/i.test(wc.getURL()),
          click: () =>
            ctx.peek.open(
              `https://translate.google.com/translate?sl=auto&tl=${t.locale}&u=${encodeURIComponent(wc.getURL())}`,
              tabId,
            ),
        },
        { type: 'separator' },
        { label: t('menu.context.savePageAs'), click: () => void savePageAs(ctx, tabId) },
        { label: t('menu.file.print'), click: () => wc.print({}, () => undefined) },
        { type: 'separator' },
        {
          label: t('menu.context.viewSource'),
          enabled: /^https?:/i.test(wc.getURL()),
          click: () => ctx.tabs.openRaw(`view-source:${wc.getURL()}`),
        },
        { label: t('menu.context.inspect'), click: () => wc.inspectElement(params.x, params.y) },
      );
      const win = ctx.windows.main?.win;
      Menu.buildFromTemplate(items).popup(win ? { window: win } : {});
    });
    void displayTitle;
  });
}
