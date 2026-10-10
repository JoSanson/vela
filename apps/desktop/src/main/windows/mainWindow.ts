import { contentBounds, CONTENT_RADIUS, topBarHeight, type Layout } from '@vela/shared';
import { BrowserWindow, type Rectangle } from 'electron';
import { preloadPath, rendererUrl } from '../context';
import { trustShell } from '../ipc/typed';

export const TOP_BAR_HEIGHT = topBarHeight(process.platform);

export interface MainWindowOptions {
  bounds: Rectangle | null;
  layout: Layout;
  backgroundColor: string;
  glass: boolean;
}

export class MainWindow {
  readonly win: BrowserWindow;
  layout: Layout;
  private readonly opaqueBackground: string;

  constructor(opts: MainWindowOptions) {
    this.layout = opts.layout;
    this.opaqueBackground = opts.backgroundColor;
    this.win = new BrowserWindow({
      width: opts.bounds?.width ?? 1280,
      height: opts.bounds?.height ?? 820,
      ...(opts.bounds ? { x: opts.bounds.x, y: opts.bounds.y } : {}),
      minWidth: 640,
      minHeight: 400,
      show: false,
      frame: process.platform === 'darwin',
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
      ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 14, y: 16 } } : {}),
      ...(process.platform !== 'darwin'
        ? { titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: TOP_BAR_HEIGHT } }
        : {}),
      backgroundColor: opts.backgroundColor,
      autoHideMenuBar: true,
      webPreferences: {
        preload: preloadPath('shell'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: false,
        backgroundThrottling: false,
      },
    });
    trustShell(this.win.webContents);
    if (opts.glass) this.setGlass(true);
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.win.webContents.on('will-navigate', (e) => e.preventDefault());
    this.win.webContents.on('will-attach-webview', (e) => e.preventDefault());
  }

  setGlass(enabled: boolean): void {
    if (process.platform === 'darwin') this.win.setVibrancy(enabled ? 'sidebar' : null);
    this.win.setBackgroundColor(enabled ? '#00000000' : this.opaqueBackground);
  }

  async load(): Promise<void> {
    await this.win.loadURL(rendererUrl('index'));
  }

  /** Region available to tab views, in window content coordinates. */
  contentBounds(): Rectangle {
    const [w, h] = this.win.getContentSize();
    return contentBounds({
      width: w ?? 0,
      height: h ?? 0,
      sidebarWidth: this.layout.sidebarWidth,
      sidebarVisible: this.layout.sidebarVisible,
      fullscreen: this.win.isFullScreen(),
      topStrip: this.layout.topStrip ?? 0,
      platform: process.platform,
    });
  }

  contentRadius(): number {
    return this.layout.sidebarVisible && !this.win.isFullScreen() ? CONTENT_RADIUS : 0;
  }
}
