import { activeSpace, type CoreState } from '@vela/core';
import { app, BrowserWindow } from 'electron';
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
import { PrefsStore } from './prefs';
import { installInternalProtocol, registerInternalScheme } from './protocol';
import { hardenSession, installAppSecurity } from './security';
import { SessionManager } from './sessions';
import { Store } from './store';
import { TabManager } from './tabs/tabManager';
import { WindowManager } from './windows/windowManager';

const startedAt = Date.now();

if (process.env.VELA_USER_DATA) app.setPath('userData', process.env.VELA_USER_DATA);
app.setName('Vela');
app.setAppUserModelId('app.vela.browser');
registerInternalScheme();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

const pendingUrls: string[] = [];
let ctx: AppContext | null = null;

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
    openLittle: (url: string) => {
      const theme = activeSpace(store.state)?.theme;
      const w = new LittleWindow({ tabs, history, store, windows }, url, theme?.from ?? '#1b1b22');
      windows.registerLittle(w);
    },
    version: app.getVersion(),
    isDev: !!devUrl,
    userData,
  };
  ctx = c;
  if (process.env.VELA_E2E) {
    (globalThis as Record<string, unknown>).__vela = {
      ctx: c,
      runCommand: (id: string, payload?: unknown) => runCommand(c, id, payload),
    };
  }

  sessions.addConfigurator((ses) => {
    installInternalProtocol(ses, rendererDir, devUrl);
    hardenSession(ses);
  });
  installInternalProtocol(sessions.get('persist:default'), rendererDir, devUrl);
  installAppSecurity(c);
  installPageContextMenu(c);
  installFind(c);
  persistLoop(c);
  installMenu(c);
  windows.setGestureHandler((cmd) => runCommand(c, cmd));

  const theme = activeSpace(store.state)?.theme;
  const mw = await windows.createMain(theme?.from ?? '#1b1b22');
  registerCoreHandlers(c);
  const shellWc = mw.win.webContents;
  store.subscribe((next) => {
    emit(shellWc, 'state/changed', next);
    if (overlay.view) emit(overlay.view.webContents, 'state/changed', next);
  });
  prefs.subscribe((p) => {
    emit(shellWc, 'prefs/changed', p);
    if (overlay.view) emit(overlay.view.webContents, 'prefs/changed', p);
  });

  mw.win.once('ready-to-show', () => {
    mw.win.show();
    console.info(`[vela] window shown in ${Date.now() - startedAt} ms`);
  });
  mw.win.on('closed', () => {
    tabs.destroyAll();
    overlay.destroy();
  });

  tabs.reconcile(store.state, null);
  await overlay.init();
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
