import type { OverlayKind, OverlayState } from '@vela/shared';
import { WebContentsView } from 'electron';
import { preloadPath, rendererUrl } from './context';
import { emit, trustShell } from './ipc/typed';
import type { TabManager } from './tabs/tabManager';
import type { WindowManager } from './windows/windowManager';

const EXIT_MS = 110;

/**
 * A single transparent WebContentsView layered above every tab view. It hosts the command bar,
 * switcher, peek and other overlays so they can render on top of web content.
 */
export class OverlayManager {
  view: WebContentsView | null = null;
  current: OverlayState = { kind: 'none', payload: null };
  visible = false;
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
    const mw = this.windows.main;
    if (!mw || this.view) return;
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
    view.webContents.on('did-finish-load', () => emit(view.webContents, 'overlay/changed', this.current));
    await view.webContents.loadURL(rendererUrl('overlay'));
  }

  show(kind: OverlayKind, payload: unknown = null): void {
    const mw = this.windows.main;
    if (!mw || !this.view) return;
    this.current = { kind, payload };
    if (this.detachTimer) {
      clearTimeout(this.detachTimer);
      this.detachTimer = null;
    }
    if (!this.visible) {
      mw.win.contentView.addChildView(this.view);
      this.visible = true;
    }
    this.layout();
    emit(this.view.webContents, 'overlay/changed', this.current);
    // Passive overlays (hover sidebar, prompts, update notes) must not steal keyboard focus from the page.
    if (
      kind === 'commandBar' ||
      kind === 'switcher' ||
      kind === 'spaceEditor' ||
      kind === 'peek' ||
      kind === 'zap'
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

  hide(): void {
    const mw = this.windows.main;
    if (!this.view) return;
    const wasVisible = this.visible;
    const wasKind = this.current.kind;
    this.current = { kind: 'none', payload: null };
    emit(this.view.webContents, 'overlay/changed', this.current);
    if (this.visible && mw && !mw.win.isDestroyed()) {
      // Detach a beat later so the renderer can play its 90 ms exit; a show() in between cancels it.
      const view = this.view;
      this.detachTimer = setTimeout(() => {
        this.detachTimer = null;
        if (this.visible || mw.win.isDestroyed()) return;
        try {
          mw.win.contentView.removeChildView(view);
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
    const active = this.tabs.activeTabId();
    if (active) this.tabs.focusTab(active);
    else mw?.win.webContents.focus();
  }

  toggle(kind: OverlayKind, payload: unknown = null): void {
    if (this.visible && this.current.kind === kind) this.hide();
    else this.show(kind, payload);
  }

  raise(): void {
    const mw = this.windows.main;
    if (!mw || !this.view || !this.visible) return;
    mw.win.contentView.addChildView(this.view);
  }

  layout(): void {
    const mw = this.windows.main;
    if (!mw || !this.view || !this.visible) return;
    const [w, h] = mw.win.getContentSize();
    this.view.setBounds({ x: 0, y: 0, width: w ?? 0, height: h ?? 0 });
  }

  destroy(): void {
    if (this.detachTimer) clearTimeout(this.detachTimer);
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close();
    this.view = null;
    this.visible = false;
  }
}
