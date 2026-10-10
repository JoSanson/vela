import {
  activeSpace,
  createTab,
  matchAtc,
  pickNextActive,
  resolveInput,
  SEARCH_ENGINES,
  visibleTabIds,
  type CoreState,
  type Id,
  type Tab,
  type TabKind,
  type TabPatch,
} from '@vela/core';
import type { OpenUrlRequest } from '@vela/shared';
import { WebContentsView, type Rectangle, type WebContents } from 'electron';
import { preloadPath } from '../context';
import type { HistoryRepo } from '../db/historyRepo';
import type { PrefsStore } from '../prefs';
import type { SessionManager } from '../sessions';
import type { Store } from '../store';
import type { WindowManager } from '../windows/windowManager';

const SPLIT_GUTTER = 6;
const ERROR_IGNORED_CODES = new Set([-3, 0]);

export interface TabManagerDeps {
  store: Store;
  sessions: SessionManager;
  prefs: PrefsStore;
  history: HistoryRepo;
  windows: WindowManager;
}

export type ViewHook = (tabId: Id, wc: WebContents) => void;

export class TabManager {
  private views = new Map<Id, WebContentsView>();
  private attached: Id[] = [];
  private htmlFullscreenTab: Id | null = null;
  private viewHooks: ViewHook[] = [];
  private afterLayoutHooks: (() => void)[] = [];
  readonly trustedCertificates = new Set<string>();

  constructor(private readonly deps: TabManagerDeps) {
    deps.store.subscribe((next, prev) => this.reconcile(next, prev));
    deps.windows.setLayoutListener(() => this.layout());
  }

  /** Called for every freshly created tab WebContents (security, blocker, boosts…). */
  onViewCreated(hook: ViewHook): void {
    this.viewHooks.push(hook);
  }

  onAfterLayout(hook: () => void): void {
    this.afterLayoutHooks.push(hook);
  }

  get state(): CoreState {
    return this.deps.store.state;
  }

  view(id: Id): WebContentsView | undefined {
    return this.views.get(id);
  }

  webContents(id: Id): WebContents | undefined {
    const v = this.views.get(id);
    return v && !v.webContents.isDestroyed() ? v.webContents : undefined;
  }

  tabIdOf(wc: WebContents): Id | undefined {
    for (const [id, v] of this.views) if (v.webContents === wc) return id;
    return undefined;
  }

  activeTabId(): Id | null {
    return activeSpace(this.state)?.activeTabId ?? null;
  }

  liveTabIds(): Id[] {
    return [...this.views.keys()];
  }

  // ---------------------------------------------------------------- lifecycle

  reconcile(state: CoreState, prev: CoreState | null): void {
    const mw = this.deps.windows.main;
    if (!mw || mw.win.isDestroyed()) return;
    for (const id of [...this.views.keys()]) {
      const tab = state.tabs[id];
      if (!tab || (tab.sleeping && prev?.tabs[id] && !prev.tabs[id]?.sleeping)) this.destroyView(id);
    }
    const visible = visibleTabIds(state);
    for (const id of [...this.attached]) if (!visible.includes(id)) this.detach(id);
    for (const id of visible) {
      const tab = state.tabs[id];
      if (!tab) continue;
      this.ensureView(tab);
      this.attach(id);
    }
    this.layout();
    const active = state.spaces[state.activeSpaceId]?.activeTabId;
    const prevActive = prev?.spaces[prev.activeSpaceId]?.activeTabId;
    if (active && active !== prevActive) this.focusTab(active);
  }

  private ensureView(tab: Tab): WebContentsView {
    const existing = this.views.get(tab.id);
    if (existing && !existing.webContents.isDestroyed()) return existing;
    const space = tab.spaceId ? this.state.spaces[tab.spaceId] : undefined;
    const partitions: Record<Id, string | undefined> = {};
    for (const p of Object.values(this.state.profiles)) partitions[p.id] = p.partition;
    const ses = this.deps.sessions.forProfile(space?.profileId ?? null, partitions);
    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        preload: preloadPath('tab'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        backgroundThrottling: true,
        safeDialogs: true,
        spellcheck: true,
        scrollBounce: true,
        navigateOnDragDrop: false,
        enableWebSQL: false,
      },
    });
    view.setBackgroundColor('#ffffff');
    this.views.set(tab.id, view);
    this.wire(tab.id, view.webContents);
    for (const hook of this.viewHooks) hook(tab.id, view.webContents);
    const zoom = this.deps.prefs.value.zoomByHost[hostKey(tab.url)] ?? tab.zoom;
    if (zoom !== 1) view.webContents.setZoomFactor(zoom);
    const url = tab.url || 'about:blank';
    const wasSleeping = tab.sleeping;
    void view.webContents.loadURL(url).catch(() => undefined);
    this.patch(tab.id, { loaded: true, sleeping: false });
    if (wasSleeping && tab.scrollY > 0) {
      const y = tab.scrollY;
      view.webContents.once('did-finish-load', () => {
        void view.webContents.executeJavaScript(`window.scrollTo(0, ${y});`, false).catch(() => undefined);
      });
    }
    return view;
  }

  private destroyView(id: Id): void {
    const view = this.views.get(id);
    if (!view) return;
    this.detach(id);
    this.views.delete(id);
    if (!view.webContents.isDestroyed()) view.webContents.close();
    if (this.htmlFullscreenTab === id) this.htmlFullscreenTab = null;
  }

  private attach(id: Id): void {
    const mw = this.deps.windows.main;
    const view = this.views.get(id);
    if (!mw || !view) return;
    if (!this.attached.includes(id)) {
      mw.win.contentView.addChildView(view);
      this.attached.push(id);
    }
  }

  private detach(id: Id): void {
    const mw = this.deps.windows.main;
    const view = this.views.get(id);
    this.attached = this.attached.filter((x) => x !== id);
    if (!mw || !view || mw.win.isDestroyed()) return;
    try {
      mw.win.contentView.removeChildView(view);
    } catch {
      /* already detached */
    }
  }

  layout(): void {
    const mw = this.deps.windows.main;
    if (!mw || mw.win.isDestroyed()) return;
    const state = this.state;
    const space = activeSpace(state);
    const panes = this.htmlFullscreenTab
      ? [this.htmlFullscreenTab]
      : (space?.split?.panes ?? (space?.activeTabId ? [space.activeTabId] : []));
    const sizes = this.htmlFullscreenTab ? [1] : (space?.split?.sizes ?? [1]);
    let bounds: Rectangle;
    let radius: number;
    if (this.htmlFullscreenTab) {
      const [w, h] = mw.win.getContentSize();
      bounds = { x: 0, y: 0, width: w ?? 0, height: h ?? 0 };
      radius = 0;
    } else {
      bounds = mw.contentBounds();
      radius = mw.contentRadius();
    }
    const gutter = panes.length > 1 ? SPLIT_GUTTER : 0;
    const totalW = bounds.width - gutter * (panes.length - 1);
    let x = bounds.x;
    panes.forEach((id, i) => {
      const view = this.views.get(id);
      if (!view) return;
      const last = i === panes.length - 1;
      const w = last ? bounds.x + bounds.width - x : Math.round(totalW * (sizes[i] ?? 1 / panes.length));
      view.setBounds({ x, y: bounds.y, width: Math.max(0, w), height: bounds.height });
      view.setBorderRadius(panes.length > 1 ? Math.min(radius, 8) : radius);
      x += w + gutter;
    });
    for (const hook of this.afterLayoutHooks) hook();
  }

  focusTab(id: Id): void {
    const wc = this.webContents(id);
    if (wc && this.attached.includes(id)) wc.focus();
  }

  // ---------------------------------------------------------------- events

  private patch(id: Id, patch: TabPatch): void {
    if (!this.state.tabs[id]) return;
    this.deps.store.dispatch({ type: 'tab/update', id, patch });
  }

  private wire(id: Id, wc: WebContents): void {
    const nav = (): TabPatch => ({
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
    });
    wc.on('did-start-loading', () => this.patch(id, { loading: true }));
    wc.on('did-stop-loading', () => this.patch(id, { loading: false, ...nav() }));
    wc.on('did-navigate', (_e, url) => {
      this.patch(id, { url, ...nav() });
      this.deps.history.recordVisit(url, wc.getTitle());
    });
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (!isMainFrame) return;
      this.patch(id, { url, ...nav() });
      this.deps.history.recordVisit(url, wc.getTitle());
    });
    wc.on('page-title-updated', (_e, title) => {
      this.patch(id, { title });
      this.deps.history.setTitle(wc.getURL(), title);
    });
    wc.on('page-favicon-updated', (_e, favicons) => {
      const favicon = favicons[0] ?? null;
      this.patch(id, { favicon });
      if (favicon) this.deps.history.setFavicon(wc.getURL(), favicon);
    });
    wc.on('audio-state-changed', (e) => this.patch(id, { audible: e.audible }));
    wc.on('focus', () => {
      const state = this.state;
      const tab = state.tabs[id];
      if (!tab) return;
      const space = activeSpace(state);
      if (space && space.activeTabId !== id && space.split?.panes.includes(id)) {
        this.deps.store.dispatch({ type: 'tab/activate', id, now: Date.now() });
      }
    });
    wc.on('enter-html-full-screen', () => {
      this.htmlFullscreenTab = id;
      this.layout();
    });
    wc.on('leave-html-full-screen', () => {
      if (this.htmlFullscreenTab === id) this.htmlFullscreenTab = null;
      this.layout();
    });
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (!isMainFrame || ERROR_IGNORED_CODES.has(code)) return;
      void wc.loadURL(errorPageUrl('net', url, `${desc} (${code})`)).catch(() => undefined);
    });
    wc.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit') return;
      const tab = this.state.tabs[id];
      void wc.loadURL(errorPageUrl('crash', tab?.url ?? '', details.reason)).catch(() => undefined);
    });
    wc.on('will-navigate', (e, url) => {
      if (url.startsWith('file:') || url.startsWith('vela://')) e.preventDefault();
    });
    wc.setWindowOpenHandler(({ url, disposition }) => {
      if (/^(https?|mailto|tel):/i.test(url)) {
        const activate = disposition !== 'background-tab';
        const tab = this.state.tabs[id];
        if (/^(mailto|tel):/i.test(url)) {
          void import('electron').then(({ shell }) => shell.openExternal(url));
        } else {
          this.openUrl({
            input: url,
            activate,
            ...(tab?.spaceId ? { spaceId: tab.spaceId } : {}),
            noAtc: true,
          });
        }
      }
      return { action: 'deny' };
    });
  }

  // ---------------------------------------------------------------- commands

  resolve(input: string): { url: string; isSearch: boolean } {
    const engine =
      SEARCH_ENGINES.find((e) => e.id === this.deps.prefs.value.searchEngineId) ?? SEARCH_ENGINES[0];
    if (!engine) return { url: input, isSearch: false };
    return resolveInput(input, engine);
  }

  openUrl(req: OpenUrlRequest): Id {
    const { url } = this.resolve(req.input);
    const state = this.state;
    const kind: TabKind = req.kind ?? 'today';
    let spaceId = req.spaceId ?? state.activeSpaceId;
    if (!req.noAtc && kind === 'today') {
      const routed = matchAtc(state.atcRules, url);
      if (routed && state.spaces[routed]) spaceId = routed;
    }
    const tab = createTab({ url, spaceId: kind === 'favorite' ? null : spaceId, kind });
    this.deps.store.dispatch({
      type: 'tab/open',
      tab,
      activate: req.activate ?? true,
      ...(req.index !== undefined ? { index: req.index } : {}),
    });
    return tab.id;
  }

  navigate(tabId: Id, input: string): void {
    const tab = this.state.tabs[tabId];
    if (!tab) return;
    const { url } = this.resolve(input);
    if (!url) return;
    const wc = this.webContents(tabId);
    if (wc) {
      void wc.loadURL(url).catch(() => undefined);
    } else {
      this.patch(tabId, { url });
    }
  }

  goBack(tabId: Id): void {
    const wc = this.webContents(tabId);
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  goForward(tabId: Id): void {
    const wc = this.webContents(tabId);
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }

  reload(tabId: Id, ignoreCache = false): void {
    const wc = this.webContents(tabId);
    if (!wc) {
      const tab = this.state.tabs[tabId];
      if (tab?.sleeping) this.deps.store.dispatch({ type: 'tab/activate', id: tabId, now: Date.now() });
      return;
    }
    if (ignoreCache) wc.reloadIgnoringCache();
    else wc.reload();
  }

  stop(tabId: Id): void {
    this.webContents(tabId)?.stop();
  }

  close(tabId: Id): void {
    const state = this.state;
    const tab = state.tabs[tabId];
    if (!tab) return;
    if (tab.kind === 'today') {
      this.deps.store.dispatch({ type: 'tab/close', id: tabId, now: Date.now(), reason: 'closed' });
      return;
    }
    // Pinned & favorites survive Cmd+W: unload them and move on.
    const spaceId = tab.spaceId ?? state.activeSpaceId;
    const space = state.spaces[spaceId];
    const next = pickNextActive(state, spaceId, tabId);
    this.destroyView(tabId);
    if (space?.split?.panes.includes(tabId))
      this.deps.store.dispatch({ type: 'split/remove', spaceId, tabId });
    this.deps.store.dispatch({ type: 'tab/reset', id: tabId });
    if (space?.activeTabId === tabId) {
      if (next) this.deps.store.dispatch({ type: 'tab/activate', id: next, now: Date.now() });
      else this.deps.store.dispatch({ type: 'space/setActiveTab', spaceId, tabId: null });
    }
  }

  closeActive(): void {
    const id = this.activeTabId();
    if (id) this.close(id);
  }

  reopenClosed(): Id | null {
    const entry = this.state.archive.find((a) => a.reason === 'closed');
    if (!entry) return null;
    const newTabId = crypto.randomUUID();
    this.deps.store.dispatch({ type: 'archive/restore', id: entry.id, newTabId, now: Date.now() });
    return newTabId;
  }

  setMuted(tabId: Id, muted: boolean): void {
    this.webContents(tabId)?.setAudioMuted(muted);
    this.patch(tabId, { muted });
  }

  setZoom(tabId: Id, zoom: number): number {
    const clamped = Math.min(5, Math.max(0.25, Math.round(zoom * 100) / 100));
    const wc = this.webContents(tabId);
    wc?.setZoomFactor(clamped);
    this.patch(tabId, { zoom: clamped });
    const tab = this.state.tabs[tabId];
    if (tab) {
      const host = hostKey(tab.url);
      const zoomByHost = { ...this.deps.prefs.value.zoomByHost };
      if (clamped === 1) delete zoomByHost[host];
      else zoomByHost[host] = clamped;
      this.deps.prefs.set({ zoomByHost });
    }
    return clamped;
  }

  zoomBy(tabId: Id, delta: number): void {
    const tab = this.state.tabs[tabId];
    if (!tab) return;
    this.setZoom(tabId, delta === 0 ? 1 : tab.zoom + delta);
  }

  toggleDevTools(tabId: Id): void {
    const wc = this.webContents(tabId);
    if (!wc) return;
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    else wc.openDevTools({ mode: 'right' });
  }

  async sleep(tabId: Id): Promise<void> {
    const wc = this.webContents(tabId);
    const tab = this.state.tabs[tabId];
    if (!wc || !tab || tab.sleeping) return;
    const scrollY = await Promise.race([
      wc.executeJavaScript('window.scrollY', false) as Promise<number>,
      new Promise<number>((r) => setTimeout(() => r(0), 300)),
    ]).catch(() => 0);
    this.patch(tabId, {
      sleeping: true,
      loaded: false,
      loading: false,
      audible: false,
      scrollY,
      url: wc.getURL() || tab.url,
    });
    this.destroyView(tabId);
  }

  wake(tabId: Id): void {
    const tab = this.state.tabs[tabId];
    if (!tab?.sleeping) return;
    this.deps.store.dispatch({ type: 'tab/activate', id: tabId, now: Date.now() });
  }

  async capture(tabId: Id, width: number): Promise<string | null> {
    const wc = this.webContents(tabId);
    if (!wc || !this.attached.includes(tabId)) return null;
    try {
      const img = await wc.capturePage();
      if (img.isEmpty()) return null;
      const size = img.getSize();
      const resized = img.resize({ width, height: Math.round((size.height * width) / size.width) });
      return resized.toDataURL();
    } catch {
      return null;
    }
  }

  destroyAll(): void {
    for (const id of [...this.views.keys()]) this.destroyView(id);
  }
}

function hostKey(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function errorPageUrl(kind: 'net' | 'crash' | 'cert', url: string, detail: string): string {
  const q = new URLSearchParams({ kind, url, detail });
  return `vela://error/?${q.toString()}`;
}
