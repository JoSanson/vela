import type { AppContext } from './context';

const SLEEP_TICK_MS = 30_000;
const ARCHIVE_TICK_MS = 5 * 60_000;
const VISIT_RETENTION_MS = 90 * 24 * 3600 * 1000;

/**
 * Memory saver + auto-archive. Both are driven by `lastActiveAt`, so lazily restored tabs that
 * were never touched this session are candidates immediately (their WebContents don't exist anyway).
 */
export interface Maintenance {
  stop: () => void;
  sleepNow: () => void;
  archiveNow: () => void;
}

export function installMaintenance(ctx: AppContext): Maintenance {
  const sweepSleep = (): void => {
    const prefs = ctx.prefs.value;
    if (!prefs.memorySaverEnabled || prefs.memorySaverMinutes <= 0) return;
    const state = ctx.store.state;
    const cutoff = Date.now() - prefs.memorySaverMinutes * 60_000;
    for (const id of ctx.tabs.liveTabIds()) {
      const tab = state.tabs[id];
      if (!tab || ctx.tabs.wantedWindow(id) || tab.sleeping || tab.alwaysActive || tab.audible) continue;
      if (tab.lastActiveAt > cutoff) continue;
      const wc = ctx.tabs.webContents(id);
      if (!wc || wc.isDevToolsOpened() || wc.isLoading()) continue;
      void ctx.tabs.sleep(id);
    }
  };

  const sweepArchive = (): void => {
    const hours = ctx.prefs.value.autoArchiveHours;
    if (!hours) return;
    ctx.store.dispatch({ type: 'maintenance/autoArchive', now: Date.now(), maxAgeMs: hours * 3_600_000 });
    ctx.store.dispatch({ type: 'maintenance/pruneArchive', max: 5000 });
    try {
      ctx.history.pruneVisits(Date.now() - VISIT_RETENTION_MS);
    } catch (err) {
      console.warn('[history] prune failed', err);
    }
  };

  const a = setInterval(sweepSleep, SLEEP_TICK_MS);
  const b = setInterval(sweepArchive, ARCHIVE_TICK_MS);
  setTimeout(sweepArchive, 10_000);
  return {
    stop: () => {
      clearInterval(a);
      clearInterval(b);
    },
    sleepNow: sweepSleep,
    archiveNow: sweepArchive,
  };
}
