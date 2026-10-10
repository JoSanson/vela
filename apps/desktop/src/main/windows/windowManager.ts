import type { Layout } from '@vela/shared';
import { screen, type BrowserWindow, type Rectangle } from 'electron';
import type { PrefsStore } from '../prefs';
import { MainWindow } from './mainWindow';

export class WindowManager {
  main: MainWindow | null = null;
  private onLayoutChange: (() => void) | null = null;

  constructor(private readonly prefs: PrefsStore) {}

  setLayoutListener(fn: () => void): void {
    this.onLayoutChange = fn;
  }

  async createMain(backgroundColor: string): Promise<MainWindow> {
    const prefs = this.prefs.value;
    const bounds = WindowManager.sanitizeBounds(prefs.windowBounds);
    const layout: Layout = { sidebarWidth: prefs.sidebarWidth, sidebarVisible: !prefs.sidebarHidden };
    const mw = new MainWindow({ bounds, layout, backgroundColor });
    this.main = mw;
    const { win } = mw;
    const persistBounds = (): void => {
      if (win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return;
      this.prefs.set({ windowBounds: win.getNormalBounds() });
    };
    win.on('resize', () => this.onLayoutChange?.());
    win.on('resized', persistBounds);
    win.on('moved', persistBounds);
    win.on('enter-full-screen', () => this.onLayoutChange?.());
    win.on('leave-full-screen', () => this.onLayoutChange?.());
    win.on('closed', () => {
      if (this.main === mw) this.main = null;
    });
    await mw.load();
    return mw;
  }

  setLayout(layout: Layout): void {
    if (!this.main) return;
    this.main.layout = layout;
    this.onLayoutChange?.();
  }

  setTopStrip(px: number): void {
    if (!this.main || this.main.topStrip === px) return;
    this.main.topStrip = px;
    this.onLayoutChange?.();
  }

  focusedMain(): BrowserWindow | null {
    return this.main?.win ?? null;
  }

  private static sanitizeBounds(b: Rectangle | null): Rectangle | null {
    if (!b) return null;
    const display = screen.getDisplayMatching(b);
    const area = display.workArea;
    const intersects =
      b.x < area.x + area.width &&
      b.x + b.width > area.x &&
      b.y < area.y + area.height &&
      b.y + b.height > area.y;
    return intersects ? b : null;
  }
}
