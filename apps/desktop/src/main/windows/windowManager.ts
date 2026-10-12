import type { Id } from '@vela/core';
import type { Layout } from '@vela/shared';
import { screen, type BrowserWindow, type Rectangle, type WebContents } from 'electron';
import type { PrefsStore } from '../prefs';
import type { LittleWindow } from './littleWindow';
import { MainWindow } from './mainWindow';

/**
 * Every main window shows one Space. A Space already shown elsewhere is shown through a per-window
 * instance (own Today, active tab and split; shared pinned and look), as Arc windows do (D037).
 * `main` is the window to act on: the focused one, else the most recently focused one.
 */
export class WindowManager {
  readonly windows = new Map<number, MainWindow>();
  readonly littles = new Set<LittleWindow>();
  private focusOrder: number[] = [];
  private onLayoutChange: ((mw: MainWindow) => void) | null = null;
  private gestureHandler: ((cmd: 'back' | 'forward') => void) | null = null;
  private onCreated: ((mw: MainWindow) => void) | null = null;
  private onFocused: ((mw: MainWindow) => void) | null = null;
  private onSpaceChanged: ((mw: MainWindow, spaceId: Id, previous: Id) => void) | null = null;
  private onClosed: ((mw: MainWindow, instances: Id[]) => void) | null = null;
  /** window id → (root Space → that window's instance of it). */
  private readonly instances = new Map<number, Map<Id, Id>>();

  constructor(private readonly prefs: PrefsStore) {}

  get main(): MainWindow | null {
    for (const id of this.focusOrder) {
      const mw = this.windows.get(id);
      if (mw && !mw.win.isDestroyed()) return mw;
    }
    const first = this.windows.values().next().value;
    return first && !first.win.isDestroyed() ? first : null;
  }

  all(): MainWindow[] {
    return [...this.windows.values()].filter((mw) => !mw.win.isDestroyed());
  }

  byId(id: number): MainWindow | undefined {
    const mw = this.windows.get(id);
    return mw && !mw.win.isDestroyed() ? mw : undefined;
  }

  /** The main window whose shell page is `wc` (not overlays, not tabs). */
  byShell(wc: WebContents): MainWindow | undefined {
    for (const mw of this.all()) if (mw.win.webContents.id === wc.id) return mw;
    return undefined;
  }

  windowForSpace(spaceId: Id): MainWindow | undefined {
    for (const mw of this.all()) if (mw.spaceId === spaceId) return mw;
    return undefined;
  }

  /** Runs for every main window (initial, ⌘N, Dock re-activation) to wire events. */
  setWindowCreatedListener(fn: (mw: MainWindow) => void): void {
    this.onCreated = fn;
  }

  /** Runs after a main window closed, with the Space instances it owned (to fold them back). */
  setClosedListener(fn: (mw: MainWindow, instances: Id[]) => void): void {
    this.onClosed = fn;
  }

  instanceOf(mw: MainWindow, rootId: Id): Id | undefined {
    return this.instances.get(mw.win.id)?.get(rootId);
  }

  setInstance(mw: MainWindow, rootId: Id, instanceId: Id): void {
    const own = this.instances.get(mw.win.id) ?? new Map<Id, Id>();
    own.set(rootId, instanceId);
    this.instances.set(mw.win.id, own);
  }

  /** The window that owns a Space instance, if `spaceId` is one. */
  ownerOf(spaceId: Id): MainWindow | undefined {
    for (const [winId, own] of this.instances)
      for (const inst of own.values()) if (inst === spaceId) return this.byId(winId);
    return undefined;
  }

  setFocusListener(fn: (mw: MainWindow) => void): void {
    this.onFocused = fn;
  }

  setSpaceListener(fn: (mw: MainWindow, spaceId: Id, previous: Id) => void): void {
    this.onSpaceChanged = fn;
  }

  setGestureHandler(fn: (cmd: 'back' | 'forward') => void): void {
    this.gestureHandler = fn;
  }

  setLayoutListener(fn: (mw: MainWindow) => void): void {
    this.onLayoutChange = fn;
  }

  registerLittle(w: LittleWindow): void {
    this.littles.add(w);
    w.win.on('closed', () => this.littles.delete(w));
  }

  littleFor(webContentsId: number): LittleWindow | undefined {
    for (const l of this.littles) if (l.win.webContents.id === webContentsId) return l;
    return undefined;
  }

  /** Shows `spaceId` in `mw`; callers pick an instance when another window shows the root. */
  setSpace(mw: MainWindow, spaceId: Id): void {
    if (mw.spaceId === spaceId) return;
    const previous = mw.spaceId;
    mw.spaceId = spaceId;
    this.onSpaceChanged?.(mw, spaceId, previous);
  }

  async createMain(
    backgroundColor: string,
    opts: { spaceId: Id; bounds?: Rectangle | null; offset?: boolean },
  ): Promise<MainWindow> {
    const prefs = this.prefs.value;
    let bounds = WindowManager.sanitizeBounds(opts.bounds === undefined ? prefs.windowBounds : opts.bounds);
    if (opts.offset && bounds) bounds = { ...bounds, x: bounds.x + 32, y: bounds.y + 32 };
    const layout: Layout = { sidebarWidth: prefs.sidebarWidth, sidebarVisible: !prefs.sidebarHidden };
    const mw = new MainWindow({ bounds, layout, backgroundColor, glass: prefs.glass, spaceId: opts.spaceId });
    const unsubscribePrefs = this.prefs.subscribe((p) => {
      if (!mw.win.isDestroyed()) mw.setGlass(p.glass);
    });
    const { win } = mw;
    this.windows.set(win.id, mw);
    this.focusOrder.unshift(win.id);
    win.once('ready-to-show', () => {
      if (!win.isDestroyed() && !win.isVisible()) win.show();
    });
    const persistBounds = (): void => {
      if (win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return;
      // The most recently used window decides where the next launch opens.
      if (this.main === mw) this.prefs.set({ windowBounds: win.getNormalBounds() });
    };
    win.on('focus', () => {
      this.focusOrder = [win.id, ...this.focusOrder.filter((i) => i !== win.id)];
      this.onFocused?.(mw);
    });
    win.on('resize', () => this.onLayoutChange?.(mw));
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
    win.on('enter-full-screen', () => this.onLayoutChange?.(mw));
    win.on('leave-full-screen', () => this.onLayoutChange?.(mw));
    win.on('closed', () => {
      unsubscribePrefs();
      this.windows.delete(win.id);
      this.focusOrder = this.focusOrder.filter((i) => i !== win.id);
      const owned = [...(this.instances.get(win.id)?.values() ?? [])];
      this.instances.delete(win.id);
      this.onClosed?.(mw, owned);
    });
    this.onCreated?.(mw);
    await mw.load();
    return mw;
  }

  setLayout(mw: MainWindow, layout: Layout): void {
    mw.layout = layout;
    mw.syncWindowButtons();
    this.onLayoutChange?.(mw);
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
