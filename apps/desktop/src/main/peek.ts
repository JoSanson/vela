import { createTab, hostOf, type Id } from '@vela/core';
import type { PeekState } from '@vela/shared';
import type { Rectangle, WebContentsView } from 'electron';
import type { AppContext } from './context';
import type { MainWindow } from './windows/mainWindow';
import { emit } from './ipc/typed';

const AUTH_RE = /(^|[./-])(accounts\.google|login|signin|sign-in|oauth|auth|sso|okta|auth0)([./?-]|$)/i;

function registrableDomain(host: string): string {
  const parts = host.split('.');
  return parts.length <= 2 ? host : parts.slice(-2).join('.');
}

/** Arc-like Peek: a link from a pinned/favorite tab to another site opens in a modal view. */
export class PeekManager {
  view: WebContentsView | null = null;
  state: PeekState | null = null;
  private fromTabId: Id | null = null;
  private unwire: (() => void) | null = null;
  private lastClickAt = new Map<Id, number>();

  constructor(private readonly ctx: Pick<AppContext, 'tabs' | 'overlay' | 'windows' | 'store' | 'history'>) {
    ctx.tabs.onAfterLayout(() => {
      this.layout();
      this.raise();
    });
    ctx.overlay.onHide(() => {
      if (this.view) this.close();
    });
    ctx.tabs.onViewCreated((tabId, wc) => {
      wc.on('input-event', (_e, input) => {
        if (input.type === 'mouseDown') this.lastClickAt.set(tabId, Date.now());
      });
      wc.once('destroyed', () => {
        this.lastClickAt.delete(tabId);
      });
      wc.on('will-navigate', (event, url) => {
        const tab = ctx.store.state.tabs[tabId];
        if (!tab || (tab.kind !== 'pinned' && tab.kind !== 'favorite') || !tab.homeUrl) return;
        const clickedRecently = Date.now() - (this.lastClickAt.get(tabId) ?? 0) < 600;
        if (!clickedRecently) return;
        const from = registrableDomain(hostOf(tab.homeUrl));
        const to = registrableDomain(hostOf(url));
        if (!from || !to || from === to) return;
        if (AUTH_RE.test(url) || AUTH_RE.test(hostOf(url))) return;
        event.preventDefault();
        this.open(url, tabId);
      });
    });
  }

  private host: MainWindow | null = null;

  hostIs(mw: MainWindow): boolean {
    return this.host === mw;
  }

  rect(): Rectangle {
    const win = this.host?.win;
    if (!win || win.isDestroyed()) return { x: 0, y: 0, width: 0, height: 0 };
    const [w, h] = win.getContentSize();
    const width = w ?? 0;
    const height = h ?? 0;
    const mx = Math.round(Math.max(24, width * 0.07));
    const top = 56;
    const bottom = 28;
    return { x: mx, y: top, width: width - mx * 2, height: Math.max(200, height - top - bottom) };
  }

  open(url: string, fromTabId?: Id): void {
    const host = (fromTabId && this.ctx.tabs.windowOf(fromTabId)) || this.ctx.windows.main;
    const win = host?.win;
    if (!host || !win || win.isDestroyed()) return;
    this.host = host;
    if (this.view) this.destroyView();
    const fromTab = fromTabId ? this.ctx.store.state.tabs[fromTabId] : undefined;
    const space = fromTab?.spaceId ? this.ctx.store.state.spaces[fromTab.spaceId] : undefined;
    const view = this.ctx.tabs.createDetachedView(space?.profileId ?? null);
    this.view = view;
    this.fromTabId = fromTabId ?? null;
    const wc = view.webContents;
    const push = (): void => {
      if (!this.view || wc.isDestroyed()) return;
      this.state = {
        url: wc.getURL() || url,
        title: wc.getTitle(),
        favicon: this.state?.favicon ?? null,
        loading: wc.isLoading(),
        canGoBack: wc.navigationHistory.canGoBack(),
        rect: this.rect(),
      };
      const target = this.ctx.overlay.view?.webContents;
      if (target) emit(target, 'peek/changed', this.state);
    };
    const onNavigate = (_e: unknown, u: string): void => {
      this.ctx.history.recordVisit(u, wc.getTitle(), space?.id ?? this.ctx.store.state.activeSpaceId);
      push();
    };
    const onTitle = (_e: unknown, title: string): void => {
      this.ctx.history.setTitle(wc.getURL(), title);
      push();
    };
    const onFavicon = (_e: unknown, favicons: string[]): void => {
      const icon = favicons[0];
      const resolver = this.ctx.tabs.faviconResolver;
      if (!icon || !resolver) return;
      // Never hand a remote URL to the overlay: it goes through the favicon cache like tabs do.
      void resolver(wc.session, wc.getURL() || url, icon).then((internal) => {
        if (!internal || this.view !== view || !this.state) return;
        this.state.favicon = internal;
        push();
      });
    };
    wc.on('did-start-loading', push);
    wc.on('did-stop-loading', push);
    wc.on('did-navigate', onNavigate);
    wc.on('did-navigate-in-page', push);
    wc.on('page-title-updated', onTitle);
    wc.on('page-favicon-updated', onFavicon);
    // Once promoted to a tab, TabManager.wire() owns these events.
    this.unwire = () => {
      wc.off('did-start-loading', push);
      wc.off('did-stop-loading', push);
      wc.off('did-navigate', onNavigate);
      wc.off('did-navigate-in-page', push);
      wc.off('page-title-updated', onTitle);
      wc.off('page-favicon-updated', onFavicon);
    };
    wc.setWindowOpenHandler(({ url: u }) => {
      if (/^https?:/i.test(u)) void wc.loadURL(u);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, u) => {
      if (u.startsWith('file:') || u.startsWith('vela://')) e.preventDefault();
    });
    this.ctx.overlay.show('peek', { url }, host);
    win.contentView.addChildView(view);
    this.layout();
    void wc.loadURL(url).catch(() => undefined);
    push();
    wc.focus();
  }

  layout(): void {
    if (!this.view) return;
    const r = this.rect();
    this.view.setBounds(r);
    this.view.setBorderRadius(14);
    if (this.state) this.state.rect = r;
  }

  raise(): void {
    const win = this.host?.win;
    if (!win || win.isDestroyed() || !this.view) return;
    win.contentView.addChildView(this.view);
  }

  private destroyView(): void {
    const win = this.host?.win;
    const view = this.view;
    this.view = null;
    this.state = null;
    this.unwire = null;
    if (!view) return;
    if (win && !win.isDestroyed()) {
      try {
        win.contentView.removeChildView(view);
      } catch {
        /* detached */
      }
    }
    // Closing while a frame is in flight logs GPU mailbox errors: let the detach land first.
    setTimeout(() => {
      if (!view.webContents.isDestroyed()) view.webContents.close();
    }, 16);
  }

  close(): void {
    const wasOpen = !!this.view;
    this.destroyView();
    const target = this.ctx.overlay.view?.webContents;
    if (target) emit(target, 'peek/changed', null);
    if (wasOpen && this.ctx.overlay.current.kind === 'peek') this.ctx.overlay.hide();
    if (this.fromTabId) this.ctx.tabs.focusTab(this.fromTabId);
    this.fromTabId = null;
  }

  openAsTab(): void {
    const view = this.view;
    const win = this.host?.win;
    if (!view || !win || win.isDestroyed()) return;
    const url = view.webContents.getURL();
    const fromTab = this.fromTabId ? this.ctx.store.state.tabs[this.fromTabId] : undefined;
    const spaceId = fromTab?.spaceId ?? this.host?.spaceId ?? this.ctx.store.state.activeSpaceId;
    const tab = createTab({ url, spaceId, title: view.webContents.getTitle() });
    try {
      win.contentView.removeChildView(view);
    } catch {
      /* ignore */
    }
    this.unwire?.();
    this.unwire = null;
    this.view = null;
    this.state = null;
    this.fromTabId = null;
    this.ctx.tabs.openWithView(tab, view);
    const target = this.ctx.overlay.view?.webContents;
    if (target) emit(target, 'peek/changed', null);
    if (this.ctx.overlay.current.kind === 'peek') this.ctx.overlay.hide();
  }

  action(action: 'close' | 'openAsTab' | 'back' | 'reload'): void {
    switch (action) {
      case 'close':
        this.close();
        return;
      case 'openAsTab':
        this.openAsTab();
        return;
      case 'back':
        if (this.view?.webContents.navigationHistory.canGoBack())
          this.view.webContents.navigationHistory.goBack();
        return;
      case 'reload':
        this.view?.webContents.reload();
    }
  }
}
