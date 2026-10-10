import type { Layout } from '@vela/shared';
import { screen, type BrowserWindow, type Rectangle } from 'electron';
import type { PrefsStore } from '../prefs';
import type { LittleWindow } from './littleWindow';
import { MainWindow } from './mainWindow';

export class WindowManager {
  main: MainWindow | null = null;
  readonly littles = new Set<LittleWindow>();
  private onLayoutChange: (() => void) | null = null;
  private gestureHandler: ((cmd: 'back' | 'forward') => void) | null = null;
  private onCreated: ((mw: MainWindow) => void) | null = null;

  /** Runs for every main window (initial and Dock re-activation) to wire events. */
  setWindowCreatedListener(fn: (mw: MainWindow) => void): void {
    this.onCreated = fn;
  }

  setGestureHandler(fn: (cmd: 'back' | 'forward') => void): void {
    this.gestureHandler = fn;
  }

  registerLittle(w: LittleWindow): void {
    this.littles.add(w);
    w.win.on('closed', () => this.littles.delete(w));
  }

  littleFor(webContentsId: number): LittleWindow | undefined {
    for (const l of this.littles) if (l.win.webContents.id === webContentsId) return l;
    return undefined;
  }

  constructor(private readonly prefs: PrefsStore) {}

  setLayoutListener(fn: () => void): void {
    this.onLayoutChange = fn;
  }

  async createMain(backgroundColor: string): Promise<MainWindow> {
    const prefs = this.prefs.value;
    const bounds = WindowManager.sanitizeBounds(prefs.windowBounds);
    const layout: Layout = { sidebarWidth: prefs.sidebarWidth, sidebarVisible: !prefs.sidebarHidden };
    const mw = new MainWindow({ bounds, layout, backgroundColor, glass: prefs.glass });
    const unsubscribePrefs = this.prefs.subscribe((p) => {
      if (!mw.win.isDestroyed()) mw.setGlass(p.glass);
    });
    this.main = mw;
    const { win } = mw;
    win.once('ready-to-show', () => {
      if (!win.isDestroyed() && !win.isVisible()) win.show();
    });
    const persistBounds = (): void => {
      if (win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return;
      this.prefs.set({ windowBounds: win.getNormalBounds() });
    };
    win.on('resize', () => this.onLayoutChange?.());
    win.on('resized', persistBounds);
    win.on('moved', persistBounds);
    win.on('swipe', (_e, direction) => {
      if (direction === 'left') this.gestureHandler?.('forward');
      if (direction === 'right') this.gestureHandler?.('back');
    });
    win.on('app-command', (_e, cmd) => {
      if (cmd === 'browser-backward') this.gestureHandler?.('back');
      if (cmd === 'browser-forward') this.gestureHandler?.('forward');
    });
    win.on('enter-full-screen', () => this.onLayoutChange?.());
    win.on('leave-full-screen', () => this.onLayoutChange?.());
    win.on('closed', () => {
      unsubscribePrefs();
      if (this.main === mw) this.main = null;
    });
    this.onCreated?.(mw);
    await mw.load();
    return mw;
  }

  setLayout(layout: Layout): void {
    if (!this.main) return;
    this.main.layout = layout;
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
