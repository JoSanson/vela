import { activeItemId, pickNextActive, rootSpaceId, type Id } from '@vela/core';
import { BrowserWindow, screen, type Rectangle } from 'electron';
import type { AppContext } from '../context';
import { activateInWindow } from '../tabs/shadows';

const GHOST_WIDTH = 300;
/** The cursor holds the placeholder by its top edge, a little below it, like a window's title bar. */
const GRAB_Y = 18;

/**
 * Dragging a tab out of the sidebar, like Arc's placeholder window: a scaled-down snapshot of the
 * window follows the cursor outside every Vela window; dropping it over another Vela window moves
 * the tab there, dropping it anywhere else opens a new window on the same Space where it landed.
 */
export class TearOff {
  private ghost: BrowserWindow | null = null;
  private ghostTab: Id | null = null;

  constructor(private readonly ctx: AppContext) {}

  async drag(req: { tabId: Id; x: number; y: number } | null, source: Electron.WebContents): Promise<void> {
    if (!req || !this.canTear(req.tabId)) {
      this.hideGhost();
      return;
    }
    if (this.windowAt(req)) {
      this.ghost?.hide();
      return;
    }
    if (this.ghostTab !== req.tabId) await this.showGhost(req.tabId, source);
    const g = this.ghost;
    if (!g || g.isDestroyed() || this.ghostTab !== req.tabId) return;
    const { width } = g.getBounds();
    g.setPosition(Math.round(req.x - width / 2), Math.round(req.y - GRAB_Y));
    if (!g.isVisible()) g.showInactive();
  }

  async drop(req: { tabId: Id; x: number; y: number }, source: Electron.WebContents): Promise<void> {
    this.hideGhost();
    const { store, windows } = this.ctx;
    const from = windows.byShell(source);
    if (!from || !this.canTear(req.tabId)) return;
    const target = this.windowAt(req);
    if (target === from) return;
    if (target) {
      this.showIn(req.tabId, target.spaceId, from.spaceId);
      target.win.focus();
      return;
    }
    // Arc's acceptDropIntoNewWindow: the same Space, in a new window with a Today of its own.
    const mw = await this.ctx.openWindow(
      rootSpaceId(store.state, from.spaceId),
      placeAt(req, from.win.getBounds()),
    );
    if (mw) this.showIn(req.tabId, mw.spaceId, from.spaceId);
  }

  /** Today tabs move into the target window's Today; favorites and pinned tabs open there. */
  private showIn(tabId: Id, spaceId: Id, fromSpaceId: Id): void {
    const { store } = this.ctx;
    const state = store.state;
    const tab = state.tabs[tabId];
    if (!tab) return;
    const now = Date.now();
    if (tab.kind === 'today') {
      store.dispatch({
        type: 'tab/move',
        id: tabId,
        to: { container: { kind: 'today', spaceId }, index: 0 },
        now,
      });
      store.dispatch({ type: 'tab/activate', id: tabId, now, spaceId });
      return;
    }
    // A shared tab leaves the window it was dragged from, so its page follows the drag.
    const source = state.spaces[fromSpaceId];
    if (source && activeItemId(state, fromSpaceId) === tabId) {
      const next = pickNextActive(state, fromSpaceId, source.activeTabId ?? tabId);
      if (next && next !== tabId) activateInWindow(this.ctx, next, fromSpaceId);
      else store.dispatch({ type: 'space/setActiveTab', spaceId: fromSpaceId, tabId: null });
    }
    activateInWindow(this.ctx, tabId, spaceId);
  }

  private canTear(tabId: Id): boolean {
    const tab = this.ctx.store.state.tabs[tabId];
    return !!tab && !tab.shadowOf;
  }

  private windowAt(p: { x: number; y: number }) {
    return this.ctx.windows.all().find((mw) => {
      if (!mw.win.isVisible() || mw.win.isMinimized()) return false;
      const b = mw.win.getBounds();
      return p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    });
  }

  private async showGhost(tabId: Id, source: Electron.WebContents): Promise<void> {
    this.ghostTab = tabId;
    const state = this.ctx.store.state;
    const tab = state.tabs[tabId];
    const theme = tab?.spaceId ? state.spaces[tab.spaceId]?.theme : undefined;
    const from = this.ctx.windows.byShell(source)?.win.getBounds() ?? { width: 1200, height: 800 };
    const height = Math.round((GHOST_WIDTH * from.height) / from.width);
    const page = this.pageShown(tabId, source);
    const shot = await this.ctx.tabs.capture(page, GHOST_WIDTH * 2);
    if (this.ghostTab !== tabId) return;
    if (!this.ghost || this.ghost.isDestroyed()) {
      this.ghost = new BrowserWindow({
        width: GHOST_WIDTH,
        height,
        show: false,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        focusable: false,
        skipTaskbar: true,
        hasShadow: false,
        alwaysOnTop: true,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false },
      });
      this.ghost.setIgnoreMouseEvents(true);
      this.ghost.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      this.ghost.webContents.on('will-navigate', (e) => e.preventDefault());
    } else {
      this.ghost.setSize(GHOST_WIDTH, height);
    }
    await this.ghost.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(ghostHtml(shot, theme?.from))}`,
    );
  }

  /** The page the source window shows for a sidebar item: its own shadow, else the tab itself. */
  private pageShown(tabId: Id, source: Electron.WebContents): Id {
    const spaceId = this.ctx.windows.byShell(source)?.spaceId;
    const active = spaceId ? this.ctx.store.state.spaces[spaceId]?.activeTabId : undefined;
    return active && this.ctx.store.state.tabs[active]?.shadowOf === tabId ? active : tabId;
  }

  private hideGhost(): void {
    this.ghostTab = null;
    if (this.ghost && !this.ghost.isDestroyed()) this.ghost.hide();
  }
}

/** A window the size of the source one, centred under the drop point the way the placeholder was held. */
function placeAt(p: { x: number; y: number }, size: { width: number; height: number }): Rectangle {
  const area = screen.getDisplayNearestPoint(p).workArea;
  const width = Math.min(size.width, area.width);
  const height = Math.min(size.height, area.height);
  const x = Math.min(Math.max(Math.round(p.x - width / 2), area.x), area.x + area.width - width);
  const y = Math.min(Math.max(Math.round(p.y - GRAB_Y), area.y), area.y + area.height - height);
  return { x, y, width, height };
}

function ghostHtml(shot: string | null, color: string | undefined): string {
  const frame = color ?? '#d9d6e6';
  const img = shot ? `<img src="${shot}" alt="">` : '';
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden}
.w{position:absolute;inset:6px;border-radius:10px;background:${frame};padding:5px 5px 5px 18%;box-sizing:border-box;opacity:.92;
box-shadow:0 10px 30px rgba(18,16,30,.28),0 0 0 .5px rgba(18,16,30,.2);animation:in .16s cubic-bezier(.2,.8,.2,1)}
.p{width:100%;height:100%;border-radius:6px;background:#fff;overflow:hidden}
img{width:100%;display:block}
@keyframes in{from{opacity:0;transform:scale(.94)}}
</style><div class="w"><div class="p">${img}</div></div>`;
}
