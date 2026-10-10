import type { Prefs } from '@vela/shared';
import { app } from 'electron';
import { join } from 'node:path';
import type { Db } from './db/database';
import type { HistoryRepo } from './db/historyRepo';
import type { StateRepo } from './db/stateRepo';
import type { OverlayManager } from './overlay';
import type { PrefsStore } from './prefs';
import type { SessionManager } from './sessions';
import type { Store } from './store';
import type { TabManager } from './tabs/tabManager';
import type { WindowManager } from './windows/windowManager';

export type RendererPage = 'index' | 'overlay' | 'little' | 'pages';

export interface AppContext {
  store: Store;
  prefs: PrefsStore;
  db: Db;
  repo: StateRepo;
  history: HistoryRepo;
  sessions: SessionManager;
  tabs: TabManager;
  windows: WindowManager;
  overlay: OverlayManager;
  version: string;
  isDev: boolean;
  userData: string;
}

export const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL;

export function rendererUrl(page: RendererPage, hash = ''): string {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) return `${devUrl}/${page}.html${hash}`;
  return `file://${join(__dirname, '../renderer', `${page}.html`)}${hash}`;
}

export function preloadPath(name: 'shell' | 'tab'): string {
  return join(__dirname, '../preload', `${name}.js`);
}

export function prefsOf(ctx: AppContext): Prefs {
  return ctx.prefs.value;
}
