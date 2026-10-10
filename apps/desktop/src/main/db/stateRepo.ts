import {
  createDefaultState,
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

/** Persists the whole CoreState in normalized tables. Writes are transactional and slice-aware. */
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
      const s = JSON.parse(r.data) as Space;
      spaces[s.id] = s;
      spaceOrder.push(s.id);
    }
    const tabs: Record<string, Tab> = {};
    for (const r of db.prepare('SELECT data FROM tabs').all() as { data: string }[]) {
      const t = JSON.parse(r.data) as Tab;
      tabs[t.id] = { ...t, loaded: false, loading: false, audible: false };
    }
    const folders: Record<string, Folder> = {};
    for (const r of db.prepare('SELECT data FROM folders').all() as { data: string }[]) {
      const f = JSON.parse(r.data) as Folder;
      folders[f.id] = f;
    }
    const archive = (
      db.prepare('SELECT data FROM archive ORDER BY archived_at DESC').all() as { data: string }[]
    ).map((r) => JSON.parse(r.data) as ArchivedTab);
    const atcRules = (
      db.prepare('SELECT data FROM atc_rules ORDER BY position').all() as { data: string }[]
    ).map((r) => JSON.parse(r.data) as AtcRule);
    const profiles: Record<string, Profile> = {};
    for (const r of db.prepare('SELECT data FROM profiles').all() as { data: string }[]) {
      const p = JSON.parse(r.data) as Profile;
      profiles[p.id] = p;
    }
    const metaRow = db.prepare("SELECT value FROM meta WHERE key = 'state'").get() as
      { value: string } | undefined;
    const meta: Partial<MetaShape> = metaRow ? (JSON.parse(metaRow.value) as Partial<MetaShape>) : {};
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
        db.prepare('DELETE FROM spaces').run();
        const ins = db.prepare('INSERT INTO spaces (id, position, data) VALUES (?, ?, ?)');
        state.spaceOrder.forEach((id, i) => {
          const s = state.spaces[id];
          if (s) ins.run(id, i, JSON.stringify(s));
        });
      }
      if (prev?.tabs !== state.tabs) {
        db.prepare('DELETE FROM tabs').run();
        const ins = db.prepare('INSERT INTO tabs (id, space_id, data) VALUES (?, ?, ?)');
        for (const t of Object.values(state.tabs)) ins.run(t.id, t.spaceId, JSON.stringify(t));
      }
      if (prev?.folders !== state.folders) {
        db.prepare('DELETE FROM folders').run();
        const ins = db.prepare('INSERT INTO folders (id, space_id, data) VALUES (?, ?, ?)');
        for (const f of Object.values(state.folders)) ins.run(f.id, f.spaceId, JSON.stringify(f));
      }
      if (prev?.archive !== state.archive) {
        db.prepare('DELETE FROM archive').run();
        const ins = db.prepare(
          'INSERT INTO archive (id, archived_at, title, url, data) VALUES (?, ?, ?, ?, ?)',
        );
        for (const a of state.archive) ins.run(a.id, a.archivedAt, a.title, a.url, JSON.stringify(a));
      }
      if (prev?.atcRules !== state.atcRules) {
        db.prepare('DELETE FROM atc_rules').run();
        const ins = db.prepare('INSERT INTO atc_rules (id, position, data) VALUES (?, ?, ?)');
        state.atcRules.forEach((r, i) => ins.run(r.id, i, JSON.stringify(r)));
      }
      if (prev?.profiles !== state.profiles) {
        db.prepare('DELETE FROM profiles').run();
        const ins = db.prepare('INSERT INTO profiles (id, data) VALUES (?, ?)');
        for (const p of Object.values(state.profiles)) ins.run(p.id, JSON.stringify(p));
      }
      const meta: MetaShape = {
        activeSpaceId: state.activeSpaceId,
        favorites: state.favorites,
        mru: state.mru,
      };
      db.prepare(
        "INSERT INTO meta (key, value) VALUES ('state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(JSON.stringify(meta));
    });
    tx();
    this.last = state;
  }
}
