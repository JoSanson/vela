import type { OverlayKind, OverlayState } from '@vela/shared';
import { WebContentsView } from 'electron';
import { preloadPath, rendererUrl } from './context';
import { emit, trustShell } from './ipc/typed';
import type { TabManager } from './tabs/tabManager';
import type { MainWindow } from './windows/mainWindow';
import type { WindowManager } from './windows/windowManager';

const EXIT_MS = 110;

/**
 * A single transparent WebContentsView layered above the tab views of whichever window is being
 * acted on (`host`). It hosts the command bar, switcher, peek chrome and prompts; one overlay is
 * open at a time across windows, like a system sheet.
 */
export class OverlayManager {
  view: WebContentsView | null = null;
  current: OverlayState = { kind: 'none', payload: null };
  visible = false;
  host: MainWindow | null = null;
  private hideHooks: ((kind: OverlayKind) => void)[] = [];
  private onceHooks: (() => void)[] = [];
  private detachTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly windows: WindowManager,
    private readonly tabs: TabManager,
  ) {
    tabs.onAfterLayout(() => {
      this.layout();
      this.raise();
    });
  }

  async init(): Promise<void> {
    if (this.view) return;
    const view = new WebContentsView({
      webPreferences: {
        preload: preloadPath('shell'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        transparent: true,
        backgroundThrottling: false,
        spellcheck: false,
      },
    });
    view.setBackgroundColor('#00000000');
    trustShell(view.webContents);
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    view.webContents.on('will-navigate', (e) => e.preventDefault());
    this.view = view;
    // The renderer subscribes after load: replay the current state so an early show() is not lost.
    view.webContents.on('did-finish-load', () => {
      emit(view.webContents, 'overlay/changed', this.current);
      if (this.host) emit(view.webContents, 'window/space', this.host.spaceId);
    });
    await view.webContents.loadURL(rendererUrl('overlay'));
  }

  show(kind: OverlayKind, payload: unknown = null, target?: MainWindow): void {
    const mw = target ?? this.windows.main;
    if (!mw || !this.view || mw.win.isDestroyed()) return;
    // A toast never replaces something the user is interacting with.
    if (kind === 'toast' && this.visible) return;
    if (this.detachTimer) {
      clearTimeout(this.detachTimer);
      this.detachTimer = null;
    }
    if (this.host && this.host !== mw) this.removeFromHost();
    this.current = { kind, payload };
    if (!this.visible || this.host !== mw) {
      mw.win.contentView.addChildView(this.view);
      this.visible = true;
    }
    if (this.host !== mw) {
      this.host = mw;
      emit(this.view.webContents, 'window/space', mw.spaceId);
    }
    this.layout();
    emit(this.view.webContents, 'overlay/changed', this.current);
    // Passive overlays (hover sidebar, prompts, update notes) must not steal keyboard focus from the page.
    if (
      kind === 'commandBar' ||
      kind === 'switcher' ||
      kind === 'spaceEditor' ||
      kind === 'peek' ||
      kind === 'zap' ||
      kind === 'authPrompt'
    ) {
      this.view.webContents.focus();
    }
  }

  /** Runs after every hide with the kind that was open. */
  onHide(fn: (kind: OverlayKind) => void): void {
    this.hideHooks.push(fn);
  }

  /** Runs once, after the next hide; returns an unsubscribe. */
  onceHide(fn: () => void): () => void {
    this.onceHooks.push(fn);
    return () => {
      this.onceHooks = this.onceHooks.filter((f) => f !== fn);
    };
  }

  private removeFromHost(): void {
    const host = this.host;
    if (!host || !this.view || host.win.isDestroyed()) return;
    try {
      host.win.contentView.removeChildView(this.view);
    } catch {
      /* already removed */
    }
  }

  hide(): void {
    const host = this.host;
    if (!this.view) return;
    const wasVisible = this.visible;
    const wasKind = this.current.kind;
    this.current = { kind: 'none', payload: null };
    emit(this.view.webContents, 'overlay/changed', this.current);
    if (this.visible && host && !host.win.isDestroyed()) {
      // Detach a beat later so the renderer can play its 90 ms exit; a show() in between cancels it.
      const view = this.view;
      this.detachTimer = setTimeout(() => {
        this.detachTimer = null;
        if (this.visible || host.win.isDestroyed()) return;
        try {
          host.win.contentView.removeChildView(view);
        } catch {
          /* already removed */
        }
      }, EXIT_MS);
    }
    this.visible = false;
    if (wasVisible) {
      for (const fn of this.hideHooks) fn(wasKind);
      for (const fn of this.onceHooks.splice(0)) fn();
    }
    const active = host ? this.tabs.state.spaces[host.spaceId]?.activeTabId : null;
    if (active) this.tabs.focusTab(active);
    else host?.win.webContents.focus();
  }

  toggle(kind: OverlayKind, payload: unknown = null): void {
    if (this.visible && this.current.kind === kind) this.hide();
    else this.show(kind, payload);
  }

  /** A window is closing: drop the overlay from it without an exit animation. */
  windowClosed(mw: MainWindow): void {
    if (this.host !== mw) return;
    if (this.detachTimer) {
      clearTimeout(this.detachTimer);
      this.detachTimer = null;
    }
    this.current = { kind: 'none', payload: null };
    this.visible = false;
    this.host = null;
    if (this.view) emit(this.view.webContents, 'overlay/changed', this.current);
  }

  raise(): void {
    const host = this.host;
    if (!host || !this.view || !this.visible || host.win.isDestroyed()) return;
    host.win.contentView.addChildView(this.view);
  }

  layout(): void {
    const host = this.host;
    if (!host || !this.view || !this.visible || host.win.isDestroyed()) return;
    const [w, h] = host.win.getContentSize();
    this.view.setBounds(OverlayManager.boundsFor(this.current, w ?? 0, h ?? 0));
  }

  /**
   * Passive overlays (autofill popover, save-password chip, toast) only cover their own rectangle so
   * the page underneath keeps receiving clicks and keystrokes; everything else covers the window.
   */
  static boundsFor(current: OverlayState, width: number, height: number): Electron.Rectangle {
    const clamp = (r: Electron.Rectangle): Electron.Rectangle => ({
      x: Math.max(0, Math.min(width - r.width, Math.round(r.x))),
      y: Math.max(0, Math.min(height - r.height, Math.round(r.y))),
      width: Math.min(width, Math.round(r.width)),
      height: Math.min(height, Math.round(r.height)),
    });
    if (current.kind === 'autofill') {
      const p = current.payload as { anchor: Electron.Rectangle; accounts: unknown[] };
      const rows = Math.max(1, Math.min(5, p.accounts.length));
      return clamp({
        x: p.anchor.x,
        y: p.anchor.y + p.anchor.height + 4,
        width: Math.max(260, Math.min(360, p.anchor.width)),
        height: rows * 40 + 12,
      });
    }
    if (current.kind === 'savePassword')
      return clamp({ x: (width - 540) / 2, y: 12, width: 540, height: 64 });
    if (current.kind === 'toast')
      return clamp({ x: (width - 420) / 2, y: height - 72, width: 420, height: 56 });
    return { x: 0, y: 0, width, height };
  }

  destroy(): void {
    if (this.detachTimer) clearTimeout(this.detachTimer);
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close();
    this.view = null;
    this.visible = false;
    this.host = null;
  }
}
