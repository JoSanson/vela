import type { Layout } from '@vela/shared';
import { BrowserWindow, type Rectangle } from 'electron';
import { preloadPath, rendererUrl } from '../context';
import { trustShell } from '../ipc/typed';

export const TOP_BAR_HEIGHT = process.platform === 'darwin' ? 0 : 36;
export const CONTENT_INSET = 8;
export const CONTENT_RADIUS = 10;
/** Strip of shell left visible when the sidebar is hidden, so hovering the edge can reveal it. */
export const HOVER_EDGE = 4;

export interface MainWindowOptions {
  bounds: Rectangle | null;
  layout: Layout;
  backgroundColor: string;
}

export class MainWindow {
  readonly win: BrowserWindow;
  layout: Layout;
  /** Extra strip reserved at the top of the content area (find bar). */
  topStrip = 0;

  constructor(opts: MainWindowOptions) {
    this.layout = opts.layout;
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
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.win.webContents.on('will-navigate', (e) => e.preventDefault());
    this.win.webContents.on('will-attach-webview', (e) => e.preventDefault());
  }

  async load(): Promise<void> {
    await this.win.loadURL(rendererUrl('index'));
  }

  /** Region available to tab views, in window content coordinates. */
  contentBounds(): Rectangle {
    const [w, h] = this.win.getContentSize();
    const width = w ?? 0;
    const height = h ?? 0;
    const fullscreen = this.win.isFullScreen();
    const sidebar = this.layout.sidebarVisible
      ? Math.round(this.layout.sidebarWidth)
      : fullscreen
        ? 0
        : HOVER_EDGE;
    const inset = this.layout.sidebarVisible && !fullscreen ? CONTENT_INSET : 0;
    const top = TOP_BAR_HEIGHT + this.topStrip;
    return {
      x: sidebar,
      y: top + inset,
      width: Math.max(0, width - sidebar - inset),
      height: Math.max(0, height - top - inset * 2),
    };
  }

  contentRadius(): number {
    return this.layout.sidebarVisible && !this.win.isFullScreen() ? CONTENT_RADIUS : 0;
  }
}
