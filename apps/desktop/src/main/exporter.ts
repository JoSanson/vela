import { createDefaultState, type CoreState, type Folder, type Space, type Tab } from '@vela/core';
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

const SAFE_URL = /^(https?:\/\/|vela:\/\/)/i;

/** Drops ids that point nowhere so a hand-edited file can never desync the reducer. */
export function sanitizeImported(input: CoreState): CoreState {
  const tabs: Record<string, Tab> = {};
  for (const t of Object.values(input.tabs)) {
    if (typeof t.url === 'string' && SAFE_URL.test(t.url)) {
      tabs[t.id] = { ...t, loaded: false, loading: false, audible: false, sleeping: false };
    }
  }
  const folders: Record<string, Folder> = {};
  for (const f of Object.values(input.folders)) if (input.spaces[f.spaceId]) folders[f.id] = { ...f };
  const known = (id: string): boolean => id in tabs || id in folders;
  const spaces: Record<string, Space> = Object.fromEntries(
    Object.values(input.spaces).map((s) => {
      const split =
        s.split && s.split.panes.every((p) => p in tabs) && s.split.panes.length >= 2 ? s.split : null;
      return [
        s.id,
        {
          ...s,
          pinned: s.pinned.filter(known),
          today: s.today.filter((id) => id in tabs),
          activeTabId: s.activeTabId && s.activeTabId in tabs ? s.activeTabId : null,
          split,
          profileId: s.profileId && input.profiles[s.profileId] ? s.profileId : null,
        },
      ];
    }),
  );
  for (const f of Object.values(folders)) f.children = f.children.filter(known);
  const spaceOrder = input.spaceOrder.filter((id) => id in spaces);
  return {
    ...input,
    tabs,
    folders,
    spaces,
    spaceOrder,
    activeSpaceId: spaceOrder.includes(input.activeSpaceId)
      ? input.activeSpaceId
      : (spaceOrder[0] ?? input.activeSpaceId),
    favorites: input.favorites.filter((id) => id in tabs),
    mru: input.mru.filter((id) => id in tabs),
    archive: input.archive.filter((a) => SAFE_URL.test(a.url)).slice(0, 5000),
  };
}

export function importState(ctx: AppContext, json: string): void {
  const raw = JSON.parse(json) as Partial<ExportBundle>;
  if (raw.format !== 'vela-export' || !raw.state) throw new Error('Not a Vela export file');
  const base = createDefaultState();
  const state = sanitizeImported({ ...base, ...raw.state });
  if (!state.spaceOrder.length || !state.spaces[state.activeSpaceId])
    throw new Error('Export file has no valid space');
  // Irreversible: keep a copy of the current database next to it first.
  try {
    ctx.db.exec(
      `VACUUM INTO '${join(ctx.userData, `state-before-import-${Date.now()}.db`).replace(/'/g, "''")}'`,
    );
  } catch (err) {
    console.warn('[import] backup failed', err);
  }
  ctx.tabs.destroyAll();
  ctx.store.dispatch({ type: 'state/replace', state });
  if (raw.prefs) {
    // Never take paths/tokens from a file: extensions and window geometry stay local.
    const { extensionPaths: _ext, windowBounds: _wb, ...rest } = raw.prefs;
    ctx.prefs.set({
      ...DEFAULT_PREFS,
      ...rest,
      extensionPaths: ctx.prefs.value.extensionPaths,
      windowBounds: ctx.prefs.value.windowBounds,
    });
  }
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
