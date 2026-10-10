import { createDefaultState, type CoreState } from '@vela/core';
import { DEFAULT_PREFS, type Boost, type Prefs } from '@vela/shared';
import { app, dialog } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppContext } from './context';

export interface ExportBundle {
  format: 'vela-export';
  version: 1;
  exportedAt: number;
  appVersion: string;
  state: CoreState;
  prefs: Prefs;
  boosts: Boost[];
}

export function exportState(ctx: AppContext): string {
  const bundle: ExportBundle = {
    format: 'vela-export',
    version: 1,
    exportedAt: Date.now(),
    appVersion: ctx.version,
    state: ctx.store.state,
    prefs: ctx.prefs.value,
    boosts: ctx.boosts.list(),
  };
  return JSON.stringify(bundle, null, 2);
}

export function importState(ctx: AppContext, json: string): void {
  const raw = JSON.parse(json) as Partial<ExportBundle>;
  if (raw.format !== 'vela-export' || !raw.state) throw new Error('Not a Vela export file');
  const base = createDefaultState();
  const state: CoreState = { ...base, ...raw.state };
  if (!state.spaceOrder.length || !state.spaces[state.activeSpaceId])
    throw new Error('Export file has no valid space');
  const tabs = Object.fromEntries(
    Object.values(state.tabs).map((t) => [
      t.id,
      { ...t, loaded: false, loading: false, audible: false, sleeping: false },
    ]),
  );
  ctx.tabs.destroyAll();
  ctx.store.dispatch({ type: 'state/replace', state: { ...state, tabs } });
  if (raw.prefs)
    ctx.prefs.set({ ...DEFAULT_PREFS, ...raw.prefs, windowBounds: ctx.prefs.value.windowBounds });
  if (Array.isArray(raw.boosts)) ctx.boosts.importJson(JSON.stringify({ boosts: raw.boosts }));
}

export async function saveExportToFile(ctx: AppContext): Promise<string | null> {
  const win = ctx.windows.main?.win;
  const defaultPath = join(
    app.getPath('documents'),
    `vela-export-${new Date().toISOString().slice(0, 10)}.json`,
  );
  const res = win
    ? await dialog.showSaveDialog(win, { defaultPath, filters: [{ name: 'JSON', extensions: ['json'] }] })
    : await dialog.showSaveDialog({ defaultPath });
  if (res.canceled || !res.filePath) return null;
  writeFileSync(res.filePath, exportState(ctx));
  return res.filePath;
}

export async function importFromFile(ctx: AppContext): Promise<boolean> {
  const win = ctx.windows.main?.win;
  const opts = { properties: ['openFile' as const], filters: [{ name: 'JSON', extensions: ['json'] }] };
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  const file = res.filePaths[0];
  if (res.canceled || !file) return false;
  importState(ctx, readFileSync(file, 'utf8'));
  return true;
}
