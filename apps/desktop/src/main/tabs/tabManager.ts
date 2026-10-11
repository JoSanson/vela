import {
  activeSpace,
  createTab,
  httpsUpgradeCandidate,
  isEphemeralSpace,
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
import { paneRects, type OpenUrlRequest } from '@vela/shared';
import { WebContentsView, type Rectangle, type WebContents } from 'electron';
import { preloadPath } from '../context';
import { trustPage } from '../ipc/typed';
import type { HistoryRepo } from '../db/historyRepo';
import type { PrefsStore } from '../prefs';
import type { SessionManager } from '../sessions';
import type { Store } from '../store';
import type { MainWindow } from '../windows/mainWindow';
import type { WindowManager } from '../windows/windowManager';

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
  /** tab id → id of the window holding its view. */
  private attached = new Map<Id, number>();
  private htmlFullscreenTab: Id | null = null;
  private viewHooks: ViewHook[] = [];
  private afterLayoutHooks: (() => void)[] = [];
  private visibilityHooks: ((tabId: Id, visible: boolean) => void)[] = [];
  private lastLayoutKey = '';
  private detachedCounter = 0;
  /** Optional favicon resolver (set by FaviconCache); returns an internal URL or null. */
  faviconResolver:
    ((ses: Electron.Session, pageUrl: string, iconUrl: string) => Promise<string | null>) | null = null;
  readonly trustedCertificates = new Set<string>();

  constructor(private readonly deps: TabManagerDeps) {
    deps.store.subscribe((next, prev) => this.reconcile(next, prev));
    deps.windows.setLayoutListener((mw) => this.layout(mw));
  }

  /** Called for every freshly created tab WebContents (security, blocker, boosts…). */
  onViewCreated(hook: ViewHook): void {
    this.viewHooks.push(hook);
  }

  /** Fires when a tab's view enters or leaves the window (auto PiP, previews…). */
  onVisibilityChange(hook: (tabId: Id, visible: boolean) => void): void {
    this.visibilityHooks.push(hook);
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
    const windows = this.deps.windows.all();
    if (windows.length === 0) return;
    for (const id of [...this.views.keys()]) {
      const tab = state.tabs[id];
      if (!tab || (tab.sleeping && prev?.tabs[id] && !prev.tabs[id]?.sleeping)) this.destroyView(id);
    }
    // Each window shows the visible tabs of its own space; a view sits in exactly one window.
    const wanted = new Map<Id, MainWindow>();
    for (const mw of windows) for (const id of visibleTabIds(state, mw.spaceId)) wanted.set(id, mw);
    const attachedBefore = [...this.attached.entries()];
    const leaving = attachedBefore
      .filter(([id, winId]) => wanted.get(id)?.win.id !== winId)
      .map(([id]) => id);
    const entering = [...wanted.keys()].filter((id) => !this.attached.has(id) && this.views.has(id));
    for (const id of leaving) if (!wanted.has(id)) for (const hook of this.visibilityHooks) hook(id, false);
    for (const [id, mw] of wanted) {
      const tab = state.tabs[id];
      if (!tab) continue;
      this.ensureView(tab);
      this.attach(id, mw);
    }
    for (const id of entering) for (const hook of this.visibilityHooks) hook(id, true);
    const layoutKey = windows
      .map((mw) => {
        const space = state.spaces[mw.spaceId];
        return `${mw.win.id}:${visibleTabIds(state, mw.spaceId).join(',')}|${(space?.split?.sizes ?? []).map((s) => s.toFixed(3)).join(',')}`;
      })
      .join(';');
    // Title/favicon/loading patches arrive many times per navigation: only touch native bounds
    // (and re-stack the overlay/peek views) when the visible set or pane sizes changed.
    if (layoutKey !== this.lastLayoutKey || this.attached.size !== attachedBefore.length) {
      this.lastLayoutKey = layoutKey;
      this.layout();
    }
    // Views that leave a window are snapshotted for the switcher before being detached; they sit
    // beneath the freshly attached views meanwhile, so the switch itself is not delayed.
    for (const id of leaving) {
      if (wanted.has(id)) continue;
      void this.snapshot(id).finally(() => {
        if (!this.wantedWindow(id)) this.detach(id);
      });
    }
    const active = state.spaces[state.activeSpaceId]?.activeTabId;
    const prevActive = prev?.spaces[prev.activeSpaceId]?.activeTabId;
    if (active && active !== prevActive) this.focusTab(active);
  }

  /** The window that should display `tabId` right now (its space's window), if any. */
  wantedWindow(tabId: Id): MainWindow | undefined {
    for (const mw of this.deps.windows.all())
      if (visibleTabIds(this.state, mw.spaceId).includes(tabId)) return mw;
    return undefined;
  }

  /** The window currently holding the tab's view. */
  windowOf(tabId: Id): MainWindow | undefined {
    const winId = this.attached.get(tabId);
    return winId === undefined ? undefined : this.deps.windows.byId(winId);
  }

  /**
   * Opens a new core tab backed by an already-loaded view (peek → "open as tab"). The view is
   * registered before the dispatch so reconcile attaches it instead of creating a second one.
   */
  openWithView(tab: Tab, view: WebContentsView): void {
    const wc = view.webContents;
    if (wc.isDestroyed()) return;
    this.views.set(tab.id, view);
    this.wire(tab.id, wc);
    for (const hook of this.viewHooks) hook(tab.id, wc);
    this.deps.store.dispatch({
      type: 'tab/open',
      tab: {
        ...tab,
        loaded: true,
        sleeping: false,
        url: wc.getURL() || tab.url,
        title: wc.getTitle() || tab.title,
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      },
      activate: true,
    });
  }

  /** Builds a tab-like WebContentsView (same security posture) without registering it. */
  webPreferencesFor(profileId: Id | null): Electron.WebPreferences {
    const partitions: Record<Id, string | undefined> = {};
    for (const p of Object.values(this.state.profiles)) partitions[p.id] = p.partition;
    return TabManager.webPreferences(this.deps.sessions.forProfile(profileId, partitions));
  }

  createDetachedView(profileId: Id | null): WebContentsView {
    const view = new WebContentsView({ webPreferences: this.webPreferencesFor(profileId) });
    view.setBackgroundColor('#ffffff');
    // Context menu, boosts, find… apply to peek/little/popup views too (under a synthetic id).
    const pseudoId = `detached:${++this.detachedCounter}`;
    for (const hook of this.viewHooks) hook(pseudoId, view.webContents);
    return view;
  }

  static webPreferences(ses: Electron.Session): Electron.WebPreferences {
    return {
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
      // Chromium's built-in PDF viewer.
      plugins: true,
    };
  }

  /** Pages asking for another app (`zoommtg:`, `slack:`…): decided by main through a prompt. */
  onExternalScheme: ((tabId: Id, url: string) => void) | null = null;

  /** https:// URLs that replaced a plain http:// one, so a TLS failure can fall back silently. */
  private readonly upgraded = new Map<string, string>();
  private readonly noUpgradeHosts = new Set<string>();

  private upgrade(url: string): string {
    if (!this.deps.prefs.value.httpsUpgrade) return url;
    const https = httpsUpgradeCandidate(url);
    if (!https) return url;
    try {
      if (this.noUpgradeHosts.has(new URL(url).host)) return url;
    } catch {
      return url;
    }
    this.upgraded.set(https, url);
    return https;
  }

  private readonly certBypassed = new Set<number>();
  private readonly lastRecorded = new Map<number, string>();
  /** WebContents that committed at least one navigation. */
  private readonly committed = new Set<number>();
  /** WebContents blocked on an HTTP auth challenge (set by AuthManager). */
  readonly authPending = new Set<number>();

  /**
   * capturePage() on a WebContents that never committed, or whose navigation is parked on an
   * HTTP auth challenge, kills the browser process (Electron 44 / Chromium 152, reproduced).
   */
  /** Main-frame URLs safe browsing refused, by WebContents: their failure becomes the interstitial. */
  private readonly unsafe = new Map<number, { url: string; threat: string }>();

  markUnsafe(wc: Electron.WebContents, url: string, threat: string): void {
    this.unsafe.set(wc.id, { url, threat });
  }

  canCapture(wc: WebContents): boolean {
    return (
      !wc.isDestroyed() && this.committed.has(wc.id) && !this.authPending.has(wc.id) && wc.getURL() !== ''
    );
  }

  /** Called from the certificate-error handler when a user-trusted certificate was accepted. */
  markCertBypass(wcId: number): void {
    this.certBypassed.add(wcId);
  }

  /** Returns the original http:// URL when `url` was an automatic upgrade that just failed. */
  fallbackFor(url: string): string | null {
    const original = this.upgraded.get(url);
    if (!original) return null;
    this.upgraded.delete(url);
    try {
      this.noUpgradeHosts.add(new URL(original).host);
    } catch {
      /* ignore */
    }
    return original;
  }

  private ensureView(tab: Tab): WebContentsView {
    const existing = this.views.get(tab.id);
    if (existing && !existing.webContents.isDestroyed()) return existing;
    const space = tab.spaceId ? this.state.spaces[tab.spaceId] : undefined;
    const partitions: Record<Id, string | undefined> = {};
    for (const p of Object.values(this.state.profiles)) partitions[p.id] = p.partition;
    const ses = this.deps.sessions.forProfile(space?.profileId ?? null, partitions);
    const view = new WebContentsView({ webPreferences: TabManager.webPreferences(ses) });
    view.setBackgroundColor('#ffffff');
    this.views.set(tab.id, view);
    this.wire(tab.id, view.webContents);
    for (const hook of this.viewHooks) hook(tab.id, view.webContents);
    const zoom = this.deps.prefs.value.zoomByHost[hostKey(tab.url)] ?? tab.zoom;
    if (zoom !== 1) view.webContents.setZoomFactor(zoom);
    const url = this.upgrade(tab.url || 'about:blank');
    const wasSleeping = tab.sleeping;
    void view.webContents.loadURL(url).catch(() => undefined);
    this.patch(tab.id, { loaded: true, sleeping: false });
    if (wasSleeping && tab.scrollY > 0) {
      const y = tab.scrollY;
      view.webContents.once('did-finish-load', () => {
        // Retry across frames: late layout (fonts, images) can clamp an early scrollTo.
        const js = `(function(y){let n=0;(function t(){window.scrollTo(0,y);if(Math.abs(window.scrollY-y)<2||n++>40)return;requestAnimationFrame(t);})();})(${y})`;
        void view.webContents.executeJavaScript(js, false).catch(() => undefined);
      });
    }
    return view;
  }

  private destroyView(id: Id): void {
    const view = this.views.get(id);
    if (!view) return;
    this.detach(id);
    this.views.delete(id);
    this.previews.delete(id);
    this.previewAt.delete(id);
    if (!view.webContents.isDestroyed()) {
      this.committed.delete(view.webContents.id);
      this.authPending.delete(view.webContents.id);
      this.lastRecorded.delete(view.webContents.id);
      view.webContents.close();
    }
    if (this.htmlFullscreenTab === id) this.htmlFullscreenTab = null;
  }

  private attach(id: Id, mw: MainWindow): void {
    const view = this.views.get(id);
    if (!view || mw.win.isDestroyed()) return;
    const current = this.attached.get(id);
    if (current === mw.win.id) return;
    if (current !== undefined) this.detach(id);
    mw.win.contentView.addChildView(view);
    this.attached.set(id, mw.win.id);
  }

  private detach(id: Id): void {
    const view = this.views.get(id);
    const winId = this.attached.get(id);
    this.attached.delete(id);
    if (!view || winId === undefined) return;
    const mw = this.deps.windows.byId(winId);
    if (!mw) return;
    try {
      mw.win.contentView.removeChildView(view);
    } catch {
      /* already detached */
    }
  }

  /** Destroys the views a closing window was showing (they come back lazily elsewhere). */
  destroyWindowViews(winId: number): void {
    for (const [id, w] of [...this.attached.entries()]) if (w === winId) this.destroyView(id);
  }

  /** Window resize / sidebar / find bar changes: bounds moved even though panes did not. */
  layout(only?: MainWindow): void {
    const state = this.state;
    for (const mw of only ? [only] : this.deps.windows.all()) {
      if (mw.win.isDestroyed()) continue;
      const space = state.spaces[mw.spaceId];
      const fullscreenTab =
        this.htmlFullscreenTab && this.attached.get(this.htmlFullscreenTab) === mw.win.id
          ? this.htmlFullscreenTab
          : null;
      const panes = fullscreenTab
        ? [fullscreenTab]
        : (space?.split?.panes ?? (space?.activeTabId ? [space.activeTabId] : []));
      const sizes = fullscreenTab ? [1] : (space?.split?.sizes ?? [1]);
      let bounds: Rectangle;
      let radius: number;
      if (fullscreenTab) {
        const [w, h] = mw.win.getContentSize();
        bounds = { x: 0, y: 0, width: w ?? 0, height: h ?? 0 };
        radius = 0;
      } else {
        bounds = mw.contentBounds();
        radius = mw.contentRadius();
      }
      const rects = paneRects(
        bounds,
        panes.length === sizes.length ? sizes : panes.map(() => 1 / panes.length),
      );
      panes.forEach((id, i) => {
        const view = this.views.get(id);
        const r = rects[i];
        if (!view || !r || this.attached.get(id) !== mw.win.id) return;
        view.setBounds(r);
        view.setBorderRadius(panes.length > 1 ? Math.min(radius, 8) : radius);
      });
    }
    for (const hook of this.afterLayoutHooks) hook();
  }

  focusTab(id: Id): void {
    const wc = this.webContents(id);
    if (wc && this.attached.has(id)) wc.focus();
  }

  // ---------------------------------------------------------------- events

  private patch(id: Id, patch: TabPatch): void {
    if (!this.state.tabs[id]) return;
    this.deps.store.dispatch({ type: 'tab/update', id, patch });
  }

  /** Tabs of a private space leave no trace: no history rows, no cached favicons. */
  private isPrivate(id: Id): boolean {
    return isEphemeralSpace(this.state, this.state.tabs[id]?.spaceId);
  }

  private wire(id: Id, wc: WebContents): void {
    trustPage(wc);
    const nav = (): TabPatch => ({
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
    });
    wc.on('did-start-loading', () => this.patch(id, { loading: true }));
    wc.on('did-stop-loading', () => this.patch(id, { loading: false, ...nav() }));
    wc.on('did-navigate', (_e, navigated) => {
      this.committed.add(wc.id);
      // Chromium reports the inner URL for view-source: documents; keep what the tab really shows.
      const url = wc.getURL().startsWith('view-source:') ? wc.getURL() : navigated;
      // Error pages are transient: the tab keeps the URL it was trying to reach (restore retries it).
      if (url.startsWith('vela://error/')) {
        this.patch(id, nav());
        return;
      }
      // Chromium zoom is per host within a session: apply the remembered level and mirror the real one.
      const stored = this.deps.prefs.value.zoomByHost[hostKey(url)];
      if (stored !== undefined && Math.abs(wc.getZoomFactor() - stored) > 0.001) wc.setZoomFactor(stored);
      const certWarning = this.certBypassed.delete(wc.id);
      this.patch(id, { url, certWarning, zoom: Math.round(wc.getZoomFactor() * 100) / 100, ...nav() });
      if (!this.isPrivate(id)) {
        this.deps.history.recordVisit(url, wc.getTitle());
        this.lastRecorded.set(wc.id, url.split('#')[0] ?? url);
      }
    });
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (!isMainFrame) return;
      this.patch(id, { url, ...nav() });
      // pushState/replaceState storms (GitHub, Twitter) must not inflate visit counts.
      const key = url.split('#')[0] ?? url;
      if (!this.isPrivate(id) && this.lastRecorded.get(wc.id) !== key) {
        this.lastRecorded.set(wc.id, key);
        this.deps.history.recordVisit(url, wc.getTitle());
      }
    });
    wc.on('page-title-updated', (_e, title) => {
      if (wc.getURL().startsWith('vela://error/')) return;
      this.patch(id, { title });
      if (!this.isPrivate(id)) this.deps.history.setTitle(wc.getURL(), title);
    });
    wc.on('page-favicon-updated', (_e, favicons) => {
      const favicon = favicons[0] ?? null;
      if (!favicon) return;
      const pageUrl = wc.getURL();
      const resolver = this.faviconResolver;
      if (this.isPrivate(id)) return;
      if (!resolver) {
        this.patch(id, { favicon });
        this.deps.history.setFavicon(pageUrl, favicon);
        return;
      }
      // Only cached (vela://favicon) icons reach the shell: it must never fetch from websites itself.
      void resolver(wc.session, pageUrl, favicon).then((internal) => {
        if (!internal) return;
        if (!wc.isDestroyed() && this.state.tabs[id]) this.patch(id, { favicon: internal });
        this.deps.history.setFavicon(pageUrl, internal);
      });
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
      if (!isMainFrame) return;
      const unsafe = this.unsafe.get(wc.id);
      if (unsafe && unsafe.url === url) {
        this.unsafe.delete(wc.id);
        void wc.loadURL(errorPageUrl('unsafe', url, unsafe.threat)).catch(() => undefined);
        return;
      }
      if (ERROR_IGNORED_CODES.has(code)) return;
      const fallback = this.fallbackFor(url);
      if (fallback) {
        void wc.loadURL(fallback).catch(() => undefined);
        return;
      }
      void wc.loadURL(errorPageUrl('net', url, `${desc} (${code})`)).catch(() => undefined);
    });
    wc.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit') return;
      const tab = this.state.tabs[id];
      void wc.loadURL(errorPageUrl('crash', tab?.url ?? '', details.reason)).catch(() => undefined);
    });
    wc.on('will-navigate', (e, url) => {
      if (url.startsWith('file:') || url.startsWith('vela://')) {
        e.preventDefault();
        return;
      }
      if (!/^(https?|about|blob|data|view-source):/i.test(url)) {
        // Another application's scheme: never navigate, ask the user instead.
        e.preventDefault();
        if (!/^javascript:/i.test(url)) this.onExternalScheme?.(id, url);
        return;
      }
      const https = this.upgrade(url);
      if (https !== url) {
        e.preventDefault();
        void wc.loadURL(https).catch(() => undefined);
      }
    });
    wc.on('did-create-window', (child) => {
      this.popups.add(child);
      child.once('closed', () => this.popups.delete(child));
      const pseudoId = `popup:${++this.detachedCounter}`;
      for (const hook of this.viewHooks) hook(pseudoId, child.webContents);
      child.webContents.setWindowOpenHandler(({ url: u }) => {
        if (/^https?:/i.test(u)) this.openUrl({ input: u, activate: true, noAtc: true });
        return { action: 'deny' };
      });
      child.webContents.on('will-navigate', (e, u) => {
        if (u.startsWith('file:') || u.startsWith('vela://')) e.preventDefault();
      });
    });
    wc.setWindowOpenHandler(({ url, disposition }) => {
      if (!/^(https?|mailto|tel|about):/i.test(url)) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^(javascript|file|vela|data|blob):/i.test(url))
          this.onExternalScheme?.(id, url);
        return { action: 'deny' };
      }
      const tab = this.state.tabs[id];
      if (/^(mailto|tel):/i.test(url)) {
        void import('electron').then(({ shell }) => shell.openExternal(url));
        return { action: 'deny' };
      }
      if (disposition === 'new-window') {
        // window.open() with features (OAuth popups, payment flows): let Chromium create a real
        // child window so `window.opener`/postMessage keep working, with our hardened preferences.
        const spaceId = tab?.spaceId ?? this.state.activeSpaceId;
        const space = this.state.spaces[spaceId];
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 640,
            autoHideMenuBar: true,
            backgroundColor: '#ffffff',
            webPreferences: this.webPreferencesFor(space?.profileId ?? null),
          },
        };
      }
      this.openUrl({
        input: url,
        activate: disposition !== 'background-tab',
        spaceId: tab?.spaceId ?? this.state.activeSpaceId,
        noAtc: true,
      });
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
    let spaceId = req.spaceId && state.spaces[req.spaceId] ? req.spaceId : state.activeSpaceId;
    // Settings, history… exist once per space: a second ⌘, focuses the open page.
    if (url.startsWith('vela://') && kind === 'today') {
      const want = url.split('#')[0] ?? url;
      const existing = Object.values(state.tabs).find(
        (t) => t.spaceId === spaceId && (t.url.split('#')[0] ?? t.url) === want,
      );
      if (existing) {
        if (req.activate ?? true)
          this.deps.store.dispatch({ type: 'tab/activate', id: existing.id, now: Date.now() });
        const wc = this.webContents(existing.id);
        if (wc && wc.getURL() !== url) void wc.loadURL(url).catch(() => undefined);
        return existing.id;
      }
    }
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
      void wc.loadURL(this.upgrade(url)).catch(() => undefined);
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
    // Pinned & favorites survive Cmd+W: unload them and move on. The tab leaves the visible set
    // before `tab/reset`, otherwise reconcile would spawn a fresh renderer for it.
    const spaceId = tab.spaceId ?? state.activeSpaceId;
    const space = state.spaces[spaceId];
    const next = pickNextActive(state, spaceId, tabId);
    this.destroyView(tabId);
    if (space?.split?.panes.includes(tabId))
      this.deps.store.dispatch({ type: 'split/remove', spaceId, tabId });
    if (space?.activeTabId === tabId) {
      if (next) this.deps.store.dispatch({ type: 'tab/activate', id: next, now: Date.now() });
      else this.deps.store.dispatch({ type: 'space/setActiveTab', spaceId, tabId: null });
    }
    this.deps.store.dispatch({ type: 'tab/reset', id: tabId });
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

  print(tabId: Id): void {
    this.webContents(tabId)?.print({}, () => undefined);
  }

  async savePage(tabId: Id, path: string): Promise<boolean> {
    const wc = this.webContents(tabId);
    if (!wc) return false;
    try {
      await wc.savePage(path, 'HTMLComplete');
      return true;
    } catch {
      return false;
    }
  }

  /** Opens a tab on a URL that must not go through input resolution (file://, view-source:). */
  openRaw(url: string, spaceId: Id = this.state.activeSpaceId): Id {
    const tab = createTab({ url, spaceId });
    this.deps.store.dispatch({ type: 'tab/open', tab, activate: true });
    return tab.id;
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
    if (!wc || !tab || tab.sleeping || visibleTabIds(this.state).includes(tabId)) return;
    const scrollY = await Promise.race([
      wc.executeJavaScript('window.scrollY', false) as Promise<number>,
      new Promise<number>((r) => setTimeout(() => r(0), 300)),
    ])
      .then((v) => Math.max(0, Math.min(1e7, Number(v) || 0)))
      .catch(() => 0);
    // The user may have switched to this tab while we were asking for its scroll position.
    if (wc.isDestroyed() || this.webContents(tabId) !== wc || visibleTabIds(this.state).includes(tabId))
      return;
    this.patch(tabId, {
      sleeping: true,
      loaded: false,
      loading: false,
      audible: false,
      scrollY,
      url: wc.getURL() || tab.url,
    });
    this.destroyView(tabId);
    this.scheduleGc();
  }

  wake(tabId: Id): void {
    const tab = this.state.tabs[tabId];
    if (!tab?.sleeping) return;
    this.deps.store.dispatch({ type: 'tab/activate', id: tabId, now: Date.now() });
  }

  /** window.open() child windows (D015): closed with the main window, never leaked. */
  private readonly popups = new Set<Electron.BrowserWindow>();
  private readonly previews = new Map<Id, string>();
  private readonly previewAt = new Map<Id, number>();
  private gcTimer: NodeJS.Timeout | null = null;

  /** Full-res `capturePage` bitmaps (~24 MB at 2x) linger until V8 collects them; nudge it. */
  private scheduleGc(): void {
    if (this.gcTimer) return;
    this.gcTimer = setTimeout(() => {
      this.gcTimer = null;
      (globalThis as { gc?: () => void }).gc?.();
    }, 500);
  }

  /** Stores a small thumbnail of a currently attached view (used by the switcher). */
  private async snapshot(tabId: Id): Promise<void> {
    const wc = this.webContents(tabId);
    if (!wc || !this.attached.has(tabId) || wc.isLoading() || !this.canCapture(wc)) return;
    if (Date.now() - (this.previewAt.get(tabId) ?? 0) < 2000) return;
    this.previewAt.set(tabId, Date.now());
    try {
      const img = await Promise.race([
        wc.capturePage(),
        new Promise<null>((r) => setTimeout(() => r(null), 150)),
      ]);
      if (!img || img.isEmpty()) return;
      const size = img.getSize();
      if (size.width === 0) return;
      this.previews.set(
        tabId,
        img.resize({ width: 320, height: Math.round((size.height * 320) / size.width) }).toDataURL(),
      );
    } catch {
      /* not paintable */
    } finally {
      this.scheduleGc();
    }
  }

  async capture(tabId: Id, width: number): Promise<string | null> {
    const wc = this.webContents(tabId);
    if (wc && this.attached.has(tabId) && this.canCapture(wc)) {
      try {
        const img = await wc.capturePage();
        if (!img.isEmpty()) {
          const size = img.getSize();
          const dataUrl = img
            .resize({ width, height: Math.round((size.height * width) / size.width) })
            .toDataURL();
          this.previews.set(tabId, dataUrl);
          return dataUrl;
        }
      } catch {
        /* fall through to cache */
      }
    }
    return this.previews.get(tabId) ?? null;
  }

  destroyAll(): void {
    for (const id of [...this.views.keys()]) this.destroyView(id);
    for (const p of [...this.popups]) if (!p.isDestroyed()) p.close();
    this.popups.clear();
  }
}

function hostKey(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function errorPageUrl(kind: 'net' | 'crash' | 'cert' | 'unsafe', url: string, detail: string): string {
  const q = new URLSearchParams({ kind, url, detail });
  return `vela://error/?${q.toString()}`;
}
