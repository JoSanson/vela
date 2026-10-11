import type { Id } from '@vela/core';
import { LITTLE_BAR_HEIGHT, type LittleState } from '@vela/shared';
import { BrowserWindow, type WebContents, type WebContentsView } from 'electron';
import type { AppContext } from '../context';
import { preloadPath, rendererUrl } from '../context';
import { emit, trustShell } from '../ipc/typed';

/** "Little Vela": a compact floating window without sidebar for links coming from other apps. */
export class LittleWindow {
  readonly win: BrowserWindow;
  readonly view: WebContentsView;
  state: LittleState;
  /** The Space whose history this window writes to (D030). */
  private readonly spaceId: Id;

  constructor(
    private readonly ctx: Pick<AppContext, 'tabs' | 'history' | 'store' | 'windows'>,
    url: string,
    backgroundColor: string,
  ) {
    this.win = new BrowserWindow({
      width: 560,
      height: 720,
      minWidth: 360,
      minHeight: 300,
      show: false,
      frame: process.platform === 'darwin',
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
      ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 12, y: 14 } } : {}),
      backgroundColor,
      autoHideMenuBar: true,
      webPreferences: {
        preload: preloadPath('shell'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        spellcheck: false,
      },
    });
    trustShell(this.win.webContents);
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.win.webContents.on('will-navigate', (e) => e.preventDefault());
    const space = ctx.store.state.spaces[ctx.store.state.activeSpaceId];
    this.spaceId = space?.id ?? ctx.store.state.activeSpaceId;
    this.view = ctx.tabs.createDetachedView(space?.profileId ?? null);
    this.state = { url, title: '', favicon: null, loading: true, canGoBack: false, canGoForward: false };
    this.wire(this.view.webContents);
    this.win.contentView.addChildView(this.view);
    this.win.on('resize', () => this.layout());
    this.win.on('closed', () => {
      if (!this.view.webContents.isDestroyed()) this.view.webContents.close();
    });
    this.layout();
    void this.win.loadURL(rendererUrl('little')).then(() => {
      this.win.show();
      this.push();
    });
    void this.view.webContents.loadURL(url).catch(() => undefined);
  }

  get shell(): WebContents {
    return this.win.webContents;
  }

  private wire(wc: WebContents): void {
    const push = (): void => this.push();
    wc.on('did-start-loading', push);
    wc.on('did-stop-loading', push);
    wc.on('did-navigate', (_e, url) => {
      this.ctx.history.recordVisit(url, wc.getTitle(), this.spaceId);
      push();
    });
    wc.on('did-navigate-in-page', push);
    wc.on('page-title-updated', (_e, title) => {
      this.ctx.history.setTitle(wc.getURL(), title);
      this.win.setTitle(title);
      push();
    });
    wc.on('page-favicon-updated', (_e, favicons) => {
      this.state.favicon = favicons[0] ?? null;
      push();
    });
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) void wc.loadURL(url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => {
      if (url.startsWith('file:') || url.startsWith('vela://')) e.preventDefault();
    });
  }

  push(): void {
    const wc = this.view.webContents;
    if (wc.isDestroyed() || this.win.isDestroyed()) return;
    this.state = {
      url: wc.getURL() || this.state.url,
      title: wc.getTitle(),
      favicon: this.state.favicon,
      loading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
    };
    emit(this.win.webContents, 'little/changed', this.state);
  }

  layout(): void {
    const [w, h] = this.win.getContentSize();
    this.view.setBounds({
      x: 0,
      y: LITTLE_BAR_HEIGHT,
      width: w ?? 0,
      height: Math.max(0, (h ?? 0) - LITTLE_BAR_HEIGHT),
    });
  }

  navigate(input: string): void {
    const { url } = this.ctx.tabs.resolve(input);
    if (url) void this.view.webContents.loadURL(url).catch(() => undefined);
  }

  /** Moves the page into the main window as a Today tab of `spaceId` (or the active space). */
  sendToMain(spaceId: Id | null): void {
    const url = this.view.webContents.getURL() || this.state.url;
    const target =
      spaceId && this.ctx.store.state.spaces[spaceId] ? spaceId : this.ctx.store.state.activeSpaceId;
    this.ctx.tabs.openUrl({ input: url, spaceId: target, activate: true, noAtc: true });
    this.ctx.windows.main?.win.focus();
    this.win.close();
  }

  action(action: 'back' | 'forward' | 'reload' | 'stop' | 'close'): void {
    const wc = this.view.webContents;
    switch (action) {
      case 'back':
        if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
        return;
      case 'forward':
        if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
        return;
      case 'reload':
        wc.reload();
        return;
      case 'stop':
        wc.stop();
        return;
      case 'close':
        this.win.close();
    }
  }
}
