import {
  createDefaultState,
  isEphemeralSpace,
  type ArchivedTab,
  type AtcRule,
  type CoreState,
  type Folder,
  type Profile,
  type Space,
  type Tab,
} from '@vela/core';
import type { Db } from './database';

interface MetaShape {
  activeSpaceId: string;
  favorites: string[];
  mru: string[];
}

function parseRow<T>(raw: string, what: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[db] skipping unreadable ${what} row`, err);
    return null;
  }
}

/**
 * Persists the CoreState in normalized tables. Writes are transactional and diff-based: only rows
 * whose object identity changed since the last save are upserted or deleted, so a title tick on one
 * tab costs one UPDATE even with thousands of tabs. Rows that fail to parse are skipped, never fatal.
 */
export class StateRepo {
  private last: CoreState | null = null;

  constructor(private readonly db: Db) {}

  load(): CoreState {
    const db = this.db;
    const spaceRows = db.prepare('SELECT data FROM spaces ORDER BY position').all() as { data: string }[];
    if (spaceRows.length === 0) return createDefaultState();
    const spaces: Record<string, Space> = {};
    const spaceOrder: string[] = [];
    for (const r of spaceRows) {
      const s = parseRow<Space>(r.data, 'space');
      if (!s?.id || !s.theme) continue;
      spaces[s.id] = { ...s, pinned: s.pinned ?? [], today: s.today ?? [] };
      spaceOrder.push(s.id);
    }
    if (spaceOrder.length === 0) return createDefaultState();
    const tabs: Record<string, Tab> = {};
    for (const r of db.prepare('SELECT data FROM tabs').all() as { data: string }[]) {
      const t = parseRow<Tab>(r.data, 'tab');
      if (!t?.id || typeof t.url !== 'string') continue;
      tabs[t.id] = { ...t, loaded: false, loading: false, audible: false };
    }
    const folders: Record<string, Folder> = {};
    for (const r of db.prepare('SELECT data FROM folders').all() as { data: string }[]) {
      const f = parseRow<Folder>(r.data, 'folder');
      if (f?.id && Array.isArray(f.children)) folders[f.id] = f;
    }
    const archive: ArchivedTab[] = [];
    for (const r of db.prepare('SELECT data FROM archive ORDER BY archived_at DESC').all() as {
      data: string;
    }[]) {
      const a = parseRow<ArchivedTab>(r.data, 'archive');
      if (a?.id && typeof a.url === 'string') archive.push(a);
    }
    const atcRules: AtcRule[] = [];
    for (const r of db.prepare('SELECT data FROM atc_rules ORDER BY position').all() as { data: string }[]) {
      const a = parseRow<AtcRule>(r.data, 'atc rule');
      if (a?.id) atcRules.push(a);
    }
    const profiles: Record<string, Profile> = {};
    for (const r of db.prepare('SELECT data FROM profiles').all() as { data: string }[]) {
      const p = parseRow<Profile>(r.data, 'profile');
      if (p?.id) profiles[p.id] = p;
    }
    const metaRow = db.prepare("SELECT value FROM meta WHERE key = 'state'").get() as
      { value: string } | undefined;
    const meta: Partial<MetaShape> = (metaRow && parseRow<Partial<MetaShape>>(metaRow.value, 'meta')) || {};
    const firstSpace = spaceOrder[0] ?? '';
    const activeSpaceId = meta.activeSpaceId && spaces[meta.activeSpaceId] ? meta.activeSpaceId : firstSpace;
    const state: CoreState = {
      spaces,
      spaceOrder,
      activeSpaceId,
      tabs,
      folders,
      favorites: (meta.favorites ?? []).filter((id) => tabs[id]),
      mru: (meta.mru ?? []).filter((id) => tabs[id]),
      archive,
      atcRules,
      profiles,
    };
    this.last = state;
    return state;
  }

  save(state: CoreState): void {
    const prev = this.last;
    const db = this.db;
    const tx = db.transaction(() => {
      if (prev?.spaces !== state.spaces || prev?.spaceOrder !== state.spaceOrder) {
        const up = db.prepare(
          'INSERT INTO spaces (id, position, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET position = excluded.position, data = excluded.data',
        );
        state.spaceOrder.forEach((id, i) => {
          const sp = state.spaces[id];
          if (sp && (prev?.spaces[id] !== sp || prev.spaceOrder[i] !== id)) up.run(id, i, JSON.stringify(sp));
        });
        const del = db.prepare('DELETE FROM spaces WHERE id = ?');
        for (const id of prev?.spaceOrder ?? []) if (!state.spaces[id]) del.run(id);
      }
      if (prev?.tabs !== state.tabs) {
        const up = db.prepare(
          'INSERT INTO tabs (id, space_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET space_id = excluded.space_id, data = excluded.data',
        );
        const del = db.prepare('DELETE FROM tabs WHERE id = ?');
        for (const t of Object.values(state.tabs)) {
          if (prev?.tabs[t.id] === t) continue;
          // Private tabs never touch the disk.
          if (isEphemeralSpace(state, t.spaceId)) del.run(t.id);
          else up.run(t.id, t.spaceId, JSON.stringify(t));
        }
        for (const id of Object.keys(prev?.tabs ?? {})) if (!state.tabs[id]) del.run(id);
      }
      if (prev?.folders !== state.folders) {
        const up = db.prepare(
          'INSERT INTO folders (id, space_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET space_id = excluded.space_id, data = excluded.data',
        );
        const del = db.prepare('DELETE FROM folders WHERE id = ?');
        for (const f of Object.values(state.folders))
          if (prev?.folders[f.id] !== f) up.run(f.id, f.spaceId, JSON.stringify(f));
        for (const id of Object.keys(prev?.folders ?? {})) if (!state.folders[id]) del.run(id);
      }
      if (prev?.archive !== state.archive) {
        const up = db.prepare(
          'INSERT INTO archive (id, archived_at, title, url, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET archived_at = excluded.archived_at, title = excluded.title, url = excluded.url, data = excluded.data',
        );
        const before = new Map((prev?.archive ?? []).map((a) => [a.id, a]));
        const now = new Set<string>();
        for (const a of state.archive) {
          now.add(a.id);
          if (before.get(a.id) !== a) up.run(a.id, a.archivedAt, a.title, a.url, JSON.stringify(a));
        }
        const del = db.prepare('DELETE FROM archive WHERE id = ?');
        for (const id of before.keys()) if (!now.has(id)) del.run(id);
      }
      if (prev?.atcRules !== state.atcRules) {
        db.prepare('DELETE FROM atc_rules').run();
        const ins = db.prepare('INSERT INTO atc_rules (id, position, data) VALUES (?, ?, ?)');
        state.atcRules.forEach((r, i) => ins.run(r.id, i, JSON.stringify(r)));
      }
      if (prev?.profiles !== state.profiles) {
        const up = db.prepare(
          'INSERT INTO profiles (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
        );
        const del = db.prepare('DELETE FROM profiles WHERE id = ?');
        for (const p of Object.values(state.profiles))
          if (prev?.profiles[p.id] !== p) up.run(p.id, JSON.stringify(p));
        for (const id of Object.keys(prev?.profiles ?? {})) if (!state.profiles[id]) del.run(id);
      }
      const meta: MetaShape = {
        activeSpaceId: state.activeSpaceId,
        favorites: state.favorites,
        mru: state.mru,
      };
      if (
        prev?.activeSpaceId !== state.activeSpaceId ||
        prev.favorites !== state.favorites ||
        prev.mru !== state.mru
      ) {
        db.prepare(
          "INSERT INTO meta (key, value) VALUES ('state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        ).run(JSON.stringify(meta));
      }
    });
    tx();
    this.last = state;
  }

  /** Full rewrite: used after a recovery or when the in-memory diff baseline is unknown. */
  saveAll(state: CoreState): void {
    this.last = null;
    this.db.transaction(() => {
      for (const t of ['spaces', 'tabs', 'folders', 'archive', 'atc_rules', 'profiles'])
        this.db.exec(`DELETE FROM ${t}`);
    })();
    this.save(state);
  }
}
