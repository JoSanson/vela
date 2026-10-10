import { activeSpace, type CoreState } from '@vela/core';
import { app, session } from 'electron';
import { join } from 'node:path';
import v8 from 'node:v8';
import { runInNewContext } from 'node:vm';
import { runCommand } from './commands';
import type { AppContext } from './context';
import { openDatabase } from './db/database';
import { HistoryRepo } from './db/historyRepo';
import { StateRepo } from './db/stateRepo';
import { registerCoreHandlers } from './ipc/handlers';
import { emit } from './ipc/typed';
import { installMenu } from './menu';
import { OverlayManager } from './overlay';
import { PeekManager } from './peek';
import { installPageContextMenu } from './contextMenu';
import { installFind } from './find';
import { LittleWindow } from './windows/littleWindow';
import { BoostsRepo, DownloadsRepo, FaviconsRepo, PermissionsRepo } from './db/repos';
import { FaviconCache } from './favicons';
import { DownloadManager } from './downloads';
import { PermissionManager } from './permissions';
import { BoostsManager } from './boosts';
import { ContentBlocker } from './blocker';
import { ExtensionManager } from './extensions';
import { UpdateManager } from './updater';
import { installMaintenance } from './maintenance';
import { installAutoPip } from './pip';
import { setPermissionDecider } from './security';
import { PrefsStore } from './prefs';
import { installInternalProtocol, registerInternalScheme } from './protocol';
import { hardenSession, installAppSecurity } from './security';
import { SessionManager } from './sessions';
import { Store } from './store';
import { TabManager } from './tabs/tabManager';
import { WindowManager } from './windows/windowManager';

import pkg from '../../package.json';

const APP_VERSION = (pkg as { version: string }).version;
const startedAt = Date.now();
const perf: Record<string, number> = {
  processStart: startedAt - Math.round(process.uptime() * 1000),
  mainStart: startedAt,
};

if (process.env.VELA_USER_DATA) app.setPath('userData', process.env.VELA_USER_DATA);
app.setName('Vela');
// Lets the main process release full-resolution capture bitmaps right after thumbnails are made
// (see TabManager.scheduleGc); only affects main-process JS, renderers are untouched.
v8.setFlagsFromString('--expose-gc');
(globalThis as { gc?: () => void }).gc = runInNewContext('gc') as () => void;
app.setAppUserModelId('app.vela.browser');
registerInternalScheme();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

const pendingUrls: string[] = [];
let ctx: AppContext | null = null;
let sweepers: ReturnType<typeof installMaintenance> | null = null;
let flushState: (() => void) | null = null;
export function flushStateNow(): void {
  flushState?.();
}

app.on('second-instance', (_e, argv) => {
  const urls = argv.filter((a) => /^https?:\/\//i.test(a) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(a));
  for (const u of urls) handleExternalUrl(u);
  const win = ctx?.windows.main?.win;
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('open-url', (e, url) => {
  e.preventDefault();
  handleExternalUrl(url);
});

function handleExternalUrl(url: string): void {
  if (!ctx) {
    pendingUrls.push(url);
    return;
  }
  ctx.openLittle(url);
}

function persistLoop(ctx: AppContext): () => void {
  let timer: NodeJS.Timeout | null = null;
  let dirty: CoreState | null = null;
  const flush = (): void => {
    if (!dirty) return;
    const s = dirty;
    dirty = null;
    try {
      ctx.repo.save(s);
    } catch (err) {
      console.error('[db] save failed', err);
    }
  };
  ctx.store.subscribe((next) => {
    dirty = next;
    if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, 150);
    }
  });
  app.on('before-quit', () => {
    if (timer) clearTimeout(timer);
    timer = null;
    flush();
  });
  return flush;
}

async function boot(): Promise<void> {
  const userData = app.getPath('userData');
  const db = openDatabase(join(userData, 'state.db'));
  const repo = new StateRepo(db);
  const history = new HistoryRepo(db);
  const prefs = new PrefsStore(join(userData, 'prefs.json'));
  const store = new Store(repo.load());
  const sessions = new SessionManager();
  const windows = new WindowManager(prefs);
  const tabs = new TabManager({ store, sessions, prefs, history, windows });
  const overlay = new OverlayManager(windows, tabs);
  const favicons = new FaviconCache(new FaviconsRepo(db));
  tabs.faviconResolver = (ses, pageUrl, iconUrl) => favicons.cache(ses, pageUrl, iconUrl);
  const downloads = new DownloadManager(new DownloadsRepo(db));
  const permissions = new PermissionManager(new PermissionsRepo(db), overlay, (wcId) => {
    for (const id of tabs.liveTabIds()) if (tabs.webContents(id)?.id === wcId) return id;
    return undefined;
  });
  const boosts = new BoostsManager(new BoostsRepo(db));
  const blocker = new ContentBlocker(prefs, userData);
  const extensions = new ExtensionManager(prefs, sessions);
  const rendererDir = join(__dirname, '../renderer');
  const devUrl = process.env.ELECTRON_RENDERER_URL;

  const c: AppContext = {
    store,
    prefs,
    db,
    repo,
    history,
    sessions,
    tabs,
    windows,
    overlay,
    peek: new PeekManager({ tabs, overlay, windows, store, history }),
    downloads,
    permissions,
    boosts,
    blocker,
    extensions,
    favicons,
    updater: new UpdateManager({ windows, prefs, overlay }),
    perf,
    openLittle: (url: string) => {
      const theme = activeSpace(store.state)?.theme;
      const w = new LittleWindow({ tabs, history, store, windows }, url, theme?.from ?? '#1b1b22');
      windows.registerLittle(w);
    },
    version: app.isPackaged ? app.getVersion() : APP_VERSION,
    isDev: !!devUrl,
    userData,
  };
  ctx = c;
  if (process.env.VELA_E2E) {
    const { detectSources, runImport } = await import('./importer');
    const exporter = await import('./exporter');
    const reader = await import('./reader');
    const theme = await import('./themeFromImage');
    const core = await import('@vela/core');
    (globalThis as Record<string, unknown>).__vela = {
      core,
      importer: {
        detectSources,
        runImport: (s: 'chrome' | 'brave' | 'edge', b: boolean, h: boolean) => runImport(c, s, b, h),
      },
      exporter,
      reader,
      theme,
      sweep: () => sweepers?.sleepNow(),
      ctx: c,
      runCommand: (id: string, payload?: unknown) => runCommand(c, id, payload),
    };
  }

  const serveFavicon = (path: string) => favicons.serve(path);
  sessions.addConfigurator((ses) => {
    installInternalProtocol(ses, rendererDir, devUrl, serveFavicon);
    hardenSession(ses);
    downloads.attach(ses);
    blocker.attach(ses);
  });
  if (process.env.VELA_BLOCKER_FILTERS) void blocker.ensureLoaded();
  void extensions.init();
  installInternalProtocol(session.defaultSession, rendererDir, devUrl, serveFavicon);
  hardenSession(session.defaultSession);
  setPermissionDecider((origin, permission, wcId) => permissions.decide(origin, permission, wcId));
  tabs.onViewCreated((_id, wc) => {
    boosts.attach(wc);
    wc.on('did-navigate', () => blocker.resetTab(wc.id));
  });
  overlay.onHide((kind) => {
    if (kind === 'permissionPrompt') permissions.dismissAll();
  });
  installAppSecurity(c);
  installPageContextMenu(c);
  installFind(c);
  flushState = persistLoop(c);
  installMenu(c);
  windows.setGestureHandler((cmd) => runCommand(c, cmd));

  const theme = activeSpace(store.state)?.theme;
  perf.appReady = Date.now();
  const mw = await windows.createMain(theme?.from ?? '#1b1b22');
  registerCoreHandlers(c);
  const internalPages = (): Electron.WebContents[] =>
    tabs
      .liveTabIds()
      .map((id) => tabs.webContents(id))
      .filter((wc): wc is Electron.WebContents => !!wc && wc.getURL().startsWith('vela://'));
  // The archive is served on demand (`archive/search`); keeping it out of the broadcast keeps every
  // navigation tick cheap even with thousands of archived tabs.
  const shellWcNow = (): Electron.WebContents | undefined => windows.main?.win.webContents;
  store.subscribe((next, prev, action) => {
    const theme = next.spaces[next.activeSpaceId]?.theme;
    if (theme && theme !== prev.spaces[prev.activeSpaceId]?.theme) windows.main?.setThemeColor(theme.from);
    const wire = { ...next, archive: [] };
    const target = shellWcNow();
    if (target) emit(target, 'state/changed', wire);
    if (overlay.view) emit(overlay.view.webContents, 'state/changed', wire);
    for (const wc of internalPages()) emit(wc, 'state/changed', wire);
    if (action.type === 'profile/delete') {
      const partition = `persist:profile-${action.id}`;
      const ses = session.fromPartition(partition);
      void ses.clearStorageData().catch(() => undefined);
      void ses.clearCache().catch(() => undefined);
    }
  });
  prefs.subscribe((p) => {
    const target = shellWcNow();
    if (target) emit(target, 'prefs/changed', p);
    if (overlay.view) emit(overlay.view.webContents, 'prefs/changed', p);
    for (const wc of internalPages()) emit(wc, 'prefs/changed', p);
  });

  mw.win.once('ready-to-show', () => {
    perf.windowShown = Date.now();
    mw.win.show();
    console.info(`[vela] window shown in ${Date.now() - startedAt} ms`);
  });

  tabs.reconcile(store.state, null);
  await overlay.init();
  sweepers = installMaintenance(c);
  installAutoPip(c);
  c.updater.start();
  downloads.onChange((list) => {
    const target = shellWcNow();
    if (target) emit(target, 'downloads/changed', list);
    for (const id of tabs.liveTabIds()) {
      const wc = tabs.webContents(id);
      if (wc?.getURL().startsWith('vela://downloads')) emit(wc, 'downloads/changed', list);
    }
  });
  if (!prefs.value.onboardingDone && Object.keys(store.state.tabs).length === 0 && !process.env.VELA_E2E) {
    tabs.openUrl({ input: 'vela://onboarding', noAtc: true });
  }
  for (const u of pendingUrls.splice(0)) handleExternalUrl(u);
}

app
  .whenReady()
  .then(boot)
  .catch((err: unknown) => {
    console.error('[vela] boot failed', err);
    flushState?.();
    app.exit(1);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (ctx?.windows.main === null) {
    const c = ctx;
    void c.windows.createMain(activeSpace(c.store.state)?.theme.from ?? '#1b1b22').then(() => {
      c.tabs.reconcile(c.store.state, null);
      return c.overlay.init();
    });
  }
});
