import {
  activeSpace,
  type CoreState,
  dropEphemeralTabs,
  needsSnapshot,
  type CoreAction,
  type StateDelta,
  isEphemeralSpace,
  createSpace,
  SPACE_PRESET_THEMES,
} from '@vela/core';
import { resolveShortcuts, unreservedOf, type BrowserImportSourceId } from '@vela/shared';
import { app, crashReporter, dialog, session } from 'electron';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import v8 from 'node:v8';
import { runInNewContext } from 'node:vm';
import { runCommand } from './commands';
import type { AppContext } from './context';
import { backup, NewerSchemaError, openDatabase } from './db/database';
import { HistoryRepo } from './db/historyRepo';
import { StateRepo } from './db/stateRepo';
import { registerCoreHandlers } from './ipc/handlers';
import { emit } from './ipc/typed';
import { installMenu } from './menu';
import { I18n } from './i18n';
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
import { AuthManager } from './auth';
import { CredentialsManager } from './credentials';
import { SafeBrowsing } from './safeBrowsing';
import { ExternalLinkManager } from './externalLinks';
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
// Minidumps stay on disk (no upload) so a crash can be diagnosed from a bug report.
crashReporter.start({ uploadToServer: false, compress: true });
process.on('uncaughtException', (err) => {
  console.error('[vela] uncaught', err);
  flushState?.();
});
process.on('unhandledRejection', (reason) => {
  console.error('[vela] unhandled rejection', reason);
});
if (!gotLock) app.quit();

const pendingUrls: string[] = [];
let ctx: AppContext | null = null;
let sweepers: ReturnType<typeof installMaintenance> | null = null;
let flushState: (() => void) | null = null;
// Set on before-quit: a boot still in flight then fails on destroyed views, which is not an error.
let quitting = false;
app.on('before-quit', () => {
  quitting = true;
});
export function flushStateNow(): void {
  flushState?.();
}

app.on('second-instance', (_e, argv) => {
  const urls = argv.slice(1).filter((a) => /^https?:\/\//i.test(a));
  for (const u of urls) handleExternalUrl(u);
  for (const f of argv.slice(1).filter((a) => a.startsWith('/') && existsSync(a)))
    handleExternalUrl(pathToFileURL(f).toString());
  const win = ctx?.windows.main?.win;
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('open-file', (e, path) => {
  e.preventDefault();
  handleExternalUrl(pathToFileURL(path).toString());
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
  if (url.startsWith('file:')) ctx.tabs.openRaw(url);
  else ctx.openLittle(url);
}

function persistLoop(ctx: AppContext): () => void {
  let timer: NodeJS.Timeout | null = null;
  let dirty: CoreState | null = null;
  let failures = 0;
  const flush = (): void => {
    if (!dirty) return;
    const s = dirty;
    try {
      ctx.repo.save(s);
      dirty = null;
      failures = 0;
    } catch (err) {
      // Disk full / locked: keep the state dirty and retry with backoff instead of dropping it.
      failures++;
      console.error('[db] save failed', err);
      const target = ctx.windows.main?.win.webContents;
      if (failures === 3 && target)
        emit(target, 'ui/command', {
          id: 'toast',
          payload: { text: ctx.i18n.t('menu.toast.saveFailed') },
        });
      setTimeout(flush, Math.min(30_000, 500 * 2 ** failures));
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
  const opened = openDatabase(join(userData, 'state.db'));
  const db = opened.db;
  const repo = new StateRepo(db);
  const history = new HistoryRepo(db);
  const prefs = new PrefsStore(join(userData, 'prefs.json'));
  const store = new Store(repo.load());
  const sessions = new SessionManager();
  const windows = new WindowManager(prefs);
  const i18n = new I18n(prefs);
  const tabs = new TabManager({ store, sessions, prefs, history, windows });
  const overlay = new OverlayManager(windows, tabs);
  const favicons = new FaviconCache(new FaviconsRepo(db));
  tabs.faviconResolver = (ses, pageUrl, iconUrl) => favicons.cache(ses, pageUrl, iconUrl);
  const downloads = new DownloadManager(new DownloadsRepo(db));
  downloads.prefs = prefs;
  downloads.onStarted = (wc, filename) => {
    const id = tabIdOfWc(wc.id);
    // A navigation that became a download leaves an empty tab behind: close it, keep the user's page.
    if (id && !wc.getURL() && Object.keys(store.state.tabs).length > 1)
      store.dispatch({ type: 'tab/close', id, now: Date.now() });
    const target = shellWcNow();
    if (target) {
      emit(target, 'ui/command', { id: 'showDownloads' });
      emit(target, 'ui/command', {
        id: 'toast',
        payload: { text: i18n.t('menu.toast.downloading', { filename }) },
      });
    }
  };
  downloads.retry = (url) => {
    const wc = tabs.webContents(tabs.activeTabId() ?? '') ?? windows.main?.win.webContents;
    wc?.downloadURL(url);
  };
  downloads.onDangerous = (id, filename) => {
    const target = windows.main?.win.webContents;
    if (target)
      emit(target, 'ui/command', {
        id: 'toast',
        payload: {
          text: i18n.t('menu.toast.dangerous', { filename }),
          action: {
            label: i18n.t('menu.toast.keep'),
            invoke: 'downloads/action',
            req: { id, action: 'keep' },
          },
        },
      });
  };
  const tabIdOfWc = (wcId: number): string | undefined => {
    for (const id of tabs.liveTabIds()) if (tabs.webContents(id)?.id === wcId) return id;
    return undefined;
  };
  const permissions = new PermissionManager(new PermissionsRepo(db), overlay, tabIdOfWc);
  const auth = new AuthManager(overlay, tabIdOfWc, tabs.authPending);
  const external = new ExternalLinkManager(overlay, prefs);
  tabs.onExternalScheme = (tabId, url) => external.request(tabId, url);
  const credentials = new CredentialsManager(db, overlay, tabs, (tabId) =>
    isEphemeralSpace(store.state, store.state.tabs[tabId]?.spaceId),
  );
  const boosts = new BoostsManager(new BoostsRepo(db));
  const blocker = new ContentBlocker(prefs, userData);
  const safeBrowsing = new SafeBrowsing(prefs, userData);
  void safeBrowsing.init();
  blocker.mainFrameGuard = (url, wc) => {
    const threat = safeBrowsing.check(url);
    if (!threat || !wc) return false;
    // The request is cancelled; the tab's did-fail-load then shows the interstitial in its place.
    tabs.markUnsafe(wc, url, threat);
    return true;
  };
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
    auth,
    external,
    credentials,
    safeBrowsing,
    i18n,
    boosts,
    blocker,
    extensions,
    favicons,
    updater: new UpdateManager({ windows, prefs, overlay }),
    perf,
    activateSpace: (id, target) => {
      const mw = target ?? windows.main;
      if (!store.state.spaces[id]) return;
      if (mw) windows.setSpace(mw, id);
      store.dispatch({ type: 'space/activate', id, now: Date.now() });
    },
    openWindow: async () => {
      const state = store.state;
      // A window shows a space nobody else shows: the next undisplayed one, or a fresh space.
      let spaceId = state.spaceOrder.find((sid) => !windows.windowForSpace(sid));
      if (!spaceId) {
        const preset = SPACE_PRESET_THEMES[state.spaceOrder.length % SPACE_PRESET_THEMES.length];
        const sp = createSpace({
          name: `Space ${state.spaceOrder.length + 1}`,
          ...(preset ? { theme: preset } : {}),
          now: Date.now(),
        });
        store.dispatch({ type: 'space/create', space: sp });
        spaceId = sp.id;
      }
      const theme = store.state.spaces[spaceId]?.theme;
      const win = await windows.createMain(theme?.from ?? '#1b1b22', { spaceId, offset: true });
      tabs.reconcile(store.state, null);
      store.dispatch({ type: 'space/activate', id: spaceId, now: Date.now() });
      return win;
    },
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
        runImport: (
          s: BrowserImportSourceId,
          b: boolean,
          h: boolean,
          st?: boolean,
          pw?: boolean,
          ck?: boolean,
        ) => runImport(c, s, b, h, st, pw, ck),
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
    if (kind === 'authPrompt') auth.dismissAll();
    if (kind === 'externalPrompt') external.dismissAll();
    if (kind === 'autofill') credentials.dismissAll();
  });
  auth.install();
  installAppSecurity(c);
  installPageContextMenu(c);
  installFind(c);
  flushState = persistLoop(c);
  installMenu(c);
  windows.setGestureHandler((cmd) => runCommand(c, cmd));

  const theme = activeSpace(store.state)?.theme;
  perf.appReady = Date.now();
  const mw = await windows.createMain(theme?.from ?? '#1b1b22', { spaceId: store.state.activeSpaceId });
  registerCoreHandlers(c);
  // Focusing a window makes its space the active one (menus, ⌘T, ⌘N act there).
  windows.setFocusListener((w) => {
    if (store.state.activeSpaceId !== w.spaceId && store.state.spaces[w.spaceId])
      store.dispatch({ type: 'space/activate', id: w.spaceId, now: Date.now() });
  });
  windows.setSpaceListener((w, spaceId) => {
    emit(w.win.webContents, 'window/space', spaceId);
    const t = store.state.spaces[spaceId]?.theme;
    if (t) w.setThemeColor(t.from);
    if (overlay.host === w && overlay.view) emit(overlay.view.webContents, 'window/space', spaceId);
    tabs.reconcile(store.state, null);
  });
  const internalPages = (): Electron.WebContents[] => {
    const list = tabs
      .liveTabIds()
      .map((id) => tabs.webContents(id))
      .filter((wc): wc is Electron.WebContents => !!wc && wc.getURL().startsWith('vela://'));
    const peek = c.peek.view?.webContents;
    if (peek && !peek.isDestroyed() && peek.getURL().startsWith('vela://')) list.push(peek);
    return list;
  };
  // The archive is served on demand (`archive/search`); keeping it out of the broadcast keeps every
  // navigation tick cheap even with thousands of archived tabs.
  const shellWcNow = (): Electron.WebContents | undefined => windows.main?.win.webContents;
  // Deltas, not snapshots: the actions of one tick are coalesced into a single message per renderer,
  // which replays them through the same reducer (packages/core/src/delta.ts).
  const broadcast = (delta: StateDelta): void => {
    for (const w of windows.all()) emit(w.win.webContents, 'state/changed', delta);
    if (overlay.view) emit(overlay.view.webContents, 'state/changed', delta);
    for (const wc of internalPages()) emit(wc, 'state/changed', delta);
  };
  let pending: CoreAction[] = [];
  let pendingFrom = store.rev;
  let flushScheduled = false;
  const flushDeltas = (): void => {
    flushScheduled = false;
    if (pending.length === 0) return;
    const actions = pending;
    pending = [];
    broadcast({ kind: 'actions', fromRev: pendingFrom, rev: pendingFrom + actions.length, actions });
    pendingFrom += actions.length;
  };
  store.subscribe((next, prev, action) => {
    // Any path that makes a space active (ATC routing, activating a tab elsewhere, direct
    // dispatches) must also show it somewhere: the acting window takes it when no window has it.
    if (next.activeSpaceId !== prev.activeSpaceId && !windows.windowForSpace(next.activeSpaceId)) {
      const mw = windows.main;
      if (mw) windows.setSpace(mw, next.activeSpaceId);
    }
    for (const w of windows.all()) {
      const t = next.spaces[w.spaceId]?.theme;
      if (t && t !== prev.spaces[w.spaceId]?.theme) w.setThemeColor(t.from);
    }
    if (needsSnapshot(action)) {
      pending = [];
      flushScheduled = false;
      pendingFrom = store.rev;
      broadcast({ kind: 'snapshot', rev: store.rev, state: { ...next, archive: [] } });
    } else {
      pending.push(action);
      if (!flushScheduled) {
        flushScheduled = true;
        setImmediate(flushDeltas);
      }
    }
    if (action.type === 'profile/delete') {
      const partition = `persist:profile-${action.id}`;
      const ses = session.fromPartition(partition);
      void ses.clearStorageData().catch(() => undefined);
      void ses.clearCache().catch(() => undefined);
    }
  });
  let lastOverrides = JSON.stringify(prefs.value.shortcutOverrides);
  let lastLocale = i18n.locale;
  prefs.subscribe(() => {
    if (i18n.locale !== lastLocale) {
      lastLocale = i18n.locale;
      installMenu(c);
    }
  });
  prefs.subscribe((p) => {
    const overrides = JSON.stringify(p.shortcutOverrides);
    if (overrides !== lastOverrides) {
      lastOverrides = overrides;
      installMenu(c);
      const table = unreservedOf(resolveShortcuts(p.shortcutOverrides)).map((d): [string, string] => [
        d.id,
        d.accelerator,
      ]);
      for (const id of tabs.liveTabIds()) {
        const wc = tabs.webContents(id);
        if (wc) emit(wc, 'shortcuts/changed', table);
      }
    }
    if (p.onboardingDone) {
      for (const t of Object.values(store.state.tabs))
        if (t.url.startsWith('vela://onboarding')) {
          // The welcome page closes itself a beat after "Start browsing" (the page shows its success state first).
          setTimeout(() => store.dispatch({ type: 'tab/close', id: t.id, now: Date.now() }), 1500);
        }
    }
    for (const w of windows.all()) emit(w.win.webContents, 'prefs/changed', p);
    if (overlay.view) emit(overlay.view.webContents, 'prefs/changed', p);
    for (const wc of internalPages()) emit(wc, 'prefs/changed', p);
  });

  mw.win.once('ready-to-show', () => {
    perf.windowShown = Date.now();
    mw.win.show();
    console.info(`[vela] window shown in ${Date.now() - startedAt} ms`);
  });

  const withoutPrivate = dropEphemeralTabs(store.state);
  if (withoutPrivate !== store.state) store.dispatch({ type: 'state/replace', state: withoutPrivate });
  tabs.reconcile(store.state, null);
  await overlay.init();
  sweepers = installMaintenance(c);
  installAutoPip(c);
  c.updater.start();
  downloads.onChange((list) => {
    for (const w of windows.all()) emit(w.win.webContents, 'downloads/changed', list);
    for (const id of tabs.liveTabIds()) {
      const wc = tabs.webContents(id);
      if (wc?.getURL().startsWith('vela://downloads')) emit(wc, 'downloads/changed', list);
    }
  });
  if (!prefs.value.onboardingDone && Object.keys(store.state.tabs).length === 0 && !process.env.VELA_E2E) {
    tabs.openUrl({ input: 'vela://onboarding', noAtc: true });
  }
  for (const u of pendingUrls.splice(0)) handleExternalUrl(u);

  if (opened.recovered) {
    mw.win.webContents.once('did-finish-load', () =>
      emit(mw.win.webContents, 'ui/command', {
        id: 'toast',
        payload: {
          text: i18n.t(opened.recovered === 'backup' ? 'menu.toast.dbBackup' : 'menu.toast.dbFresh'),
        },
      }),
    );
  }
  // A marker that only a clean quit removes: its presence at boot means the last session crashed.
  const marker = join(userData, 'running');
  if (existsSync(marker) && Object.keys(store.state.tabs).length > 0 && !process.env.VELA_E2E) {
    mw.win.webContents.once('did-finish-load', () =>
      emit(mw.win.webContents, 'ui/command', {
        id: 'toast',
        payload: { text: i18n.t('menu.toast.crashRestored') },
      }),
    );
  }
  try {
    mkdirSync(userData, { recursive: true });
    writeFileSync(marker, String(process.pid));
  } catch {
    /* read-only userData */
  }
  app.once('before-quit', () => rmSync(marker, { force: true }));
  app.once('will-quit', () => {
    prefs.flush();
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
    } catch {
      /* already closed */
    }
  });
  // Daily backup of the tab database (rotated by openDatabase).
  setTimeout(() => backup(db, join(userData, 'state.db'), 'daily'), 60_000).unref();
  setInterval(() => backup(db, join(userData, 'state.db'), 'daily'), 24 * 3600 * 1000).unref();
  app.on('child-process-gone', (_e, details) => {
    if (details.type !== 'GPU' || details.reason === 'clean-exit') return;
    // Chromium restarts the GPU process; views must be re-laid out to repaint.
    setTimeout(() => tabs.layout(), 300);
    const target = shellWcNow();
    if (target)
      emit(target, 'ui/command', { id: 'toast', payload: { text: i18n.t('menu.toast.gpuRestarted') } });
  });
  const reviveShell = (wc: Electron.WebContents, what: string): void => {
    wc.on('render-process-gone', (_e, d) => {
      if (d.reason === 'clean-exit') return;
      console.error(`[vela] ${what} renderer gone (${d.reason}), reloading`);
      wc.reload();
    });
    wc.on('unresponsive', () => console.warn(`[vela] ${what} unresponsive`));
  };
  reviveShell(mw.win.webContents, 'shell');
  if (overlay.view) reviveShell(overlay.view.webContents, 'overlay');
}

app
  .whenReady()
  .then(boot)
  .catch((err: unknown) => {
    if (quitting) return;
    console.error('[vela] boot failed', err);
    flushState?.();
    const detail =
      err instanceof NewerSchemaError
        ? 'Your data was saved by a newer version of Vela. Update Vela, or restore a backup from the profile folder.'
        : err instanceof Error
          ? err.message
          : String(err);
    dialog.showErrorBox('Vela could not start', detail);
    app.exit(1);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (ctx?.windows.main === null) {
    const c = ctx;
    void c.windows
      .createMain(activeSpace(c.store.state)?.theme.from ?? '#1b1b22', {
        spaceId: c.store.state.activeSpaceId,
      })
      .then(() => {
        c.tabs.reconcile(c.store.state, null);
        return c.overlay.init();
      });
  }
});
