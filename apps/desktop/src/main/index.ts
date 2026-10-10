import { activeSpace, type CoreState } from '@vela/core';
import { app, BrowserWindow, session } from 'electron';
import { join } from 'node:path';
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
// (see TabManager.snapshot); only affects main-process JS, renderers are untouched.
app.commandLine.appendSwitch('js-flags', '--expose-gc');
app.setAppUserModelId('app.vela.browser');
registerInternalScheme();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

const pendingUrls: string[] = [];
let ctx: AppContext | null = null;
let sweepers: ReturnType<typeof installMaintenance> | null = null;

app.on('second-instance', (_e, argv) => {
  const urls = argv.filter((a) => /^https?:\/\//i.test(a));
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

function persistLoop(ctx: AppContext): void {
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
    const core = await import('@vela/core');
    (globalThis as Record<string, unknown>).__vela = {
      core,
      importer: {
        detectSources,
        runImport: (s: 'chrome' | 'brave' | 'edge', b: boolean, h: boolean) => runImport(c, s, b, h),
      },
      exporter,
      reader,
      sweep: () => sweepers?.sleepNow(),
      ctx: c,
      runCommand: (id: string, payload?: unknown) => runCommand(c, id, payload),
    };
  }

  const serveFavicon = (host: string) => favicons.serve(host);
  sessions.addConfigurator((ses) => {
    installInternalProtocol(ses, rendererDir, devUrl, serveFavicon);
    hardenSession(ses);
    downloads.attach(ses);
    blocker.attach(ses);
  });
  void blocker.init();
  installInternalProtocol(sessions.get('persist:default'), rendererDir, devUrl, serveFavicon);
  installInternalProtocol(session.defaultSession, rendererDir, devUrl, serveFavicon);
  setPermissionDecider((origin, permission, wcId) => permissions.decide(origin, permission, wcId));
  tabs.onViewCreated((_id, wc) => {
    boosts.attach(wc);
    wc.on('did-navigate', () => blocker.resetTab(wc.id));
  });
  overlay.onHide(() => permissions.dismissAll());
  installAppSecurity(c);
  installPageContextMenu(c);
  installFind(c);
  persistLoop(c);
  installMenu(c);
  windows.setGestureHandler((cmd) => runCommand(c, cmd));

  const theme = activeSpace(store.state)?.theme;
  perf.appReady = Date.now();
  const mw = await windows.createMain(theme?.from ?? '#1b1b22');
  registerCoreHandlers(c);
  const shellWc = mw.win.webContents;
  const internalPages = (): Electron.WebContents[] =>
    tabs
      .liveTabIds()
      .map((id) => tabs.webContents(id))
      .filter((wc): wc is Electron.WebContents => !!wc && wc.getURL().startsWith('vela://'));
  store.subscribe((next) => {
    emit(shellWc, 'state/changed', next);
    if (overlay.view) emit(overlay.view.webContents, 'state/changed', next);
    for (const wc of internalPages()) emit(wc, 'state/changed', next);
  });
  prefs.subscribe((p) => {
    emit(shellWc, 'prefs/changed', p);
    if (overlay.view) emit(overlay.view.webContents, 'prefs/changed', p);
    for (const wc of internalPages()) emit(wc, 'prefs/changed', p);
  });

  mw.win.once('ready-to-show', () => {
    perf.windowShown = Date.now();
    mw.win.show();
    console.info(`[vela] window shown in ${Date.now() - startedAt} ms`);
  });
  mw.win.on('closed', () => {
    tabs.destroyAll();
    overlay.destroy();
  });

  tabs.reconcile(store.state, null);
  await overlay.init();
  sweepers = installMaintenance(c);
  installAutoPip(c);
  c.updater.start();
  downloads.onChange((list) => {
    emit(shellWc, 'downloads/changed', list);
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
    app.exit(1);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && ctx) {
    void ctx.windows.createMain(activeSpace(ctx.store.state)?.theme.from ?? '#1b1b22').then(() => {
      ctx?.tabs.reconcile(ctx.store.state, null);
      return ctx?.overlay.init();
    });
  }
});
