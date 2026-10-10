import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createFolder,
  createProfile,
  createSpace,
  createTab,
  type ArchivedTab,
  type CoreState,
  type Tab,
} from '@vela/core';
import { openDatabase, type Db } from './database';
import { migrate } from './migrations';
import { StateRepo } from './stateRepo';

const NOW = 1_700_000_000_000;

const sqliteAvailable = ((): boolean => {
  try {
    const load = createRequire(import.meta.url);
    const Database = load('better-sqlite3') as new (file: string) => { close(): void };
    new Database(':memory:').close();
    return true;
  } catch {
    return false;
  }
})();

function tab(id: string, spaceId: string | null, kind: Tab['kind'], extra: Partial<Tab> = {}): Tab {
  return {
    ...createTab({ id, url: `https://${id}.example.com/`, spaceId, kind, title: `Title ${id}`, now: NOW }),
    loaded: true,
    loading: true,
    audible: true,
    ...extra,
  };
}

function fixtureState(): CoreState {
  const home = { ...createSpace({ id: 's1', name: 'Home', emoji: '🏠', now: NOW }), profileId: 'pr1' };
  const work = {
    ...createSpace({ id: 's2', name: 'Work', now: NOW + 1 }),
    split: { panes: ['w1', 'w2'], sizes: [0.4, 0.6] },
  };
  const tabs: Record<string, Tab> = {
    h1: tab('h1', 's1', 'today', { customTitle: 'Custom', zoom: 1.25, scrollY: 42 }),
    h2: tab('h2', 's1', 'today', { sleeping: true, muted: true }),
    p1: tab('p1', 's1', 'pinned', { favicon: 'data:image/png;base64,AAA' }),
    w1: tab('w1', 's2', 'today'),
    w2: tab('w2', 's2', 'pinned', { alwaysActive: true }),
    fav: tab('fav', null, 'favorite', { emoji: '⭐' }),
  };
  const folders = {
    f1: { ...createFolder({ id: 'f1', spaceId: 's1', name: 'Folder', emoji: '📁' }), children: ['p1', 'f2'] },
    f2: { ...createFolder({ id: 'f2', spaceId: 's1', name: 'Nested' }), collapsed: true },
  };
  const archive: ArchivedTab[] = [
    {
      id: 'a2',
      spaceId: 's1',
      spaceName: 'Home',
      url: 'https://a2.test/',
      title: 'A2',
      favicon: null,
      archivedAt: NOW + 20,
      reason: 'closed',
    },
    {
      id: 'a1',
      spaceId: null,
      spaceName: 'Favorites',
      url: 'https://a1.test/',
      title: 'A1',
      favicon: 'ico',
      archivedAt: NOW + 10,
      reason: 'auto',
    },
  ];
  return {
    spaces: {
      s1: { ...home, pinned: ['f1'], today: ['h2', 'h1'], activeTabId: 'h1' },
      s2: { ...work, pinned: ['w2'], today: ['w1'], activeTabId: 'w1' },
    },
    spaceOrder: ['s2', 's1'],
    activeSpaceId: 's1',
    tabs,
    folders,
    favorites: ['fav'],
    mru: ['h1', 'w1', 'fav', 'p1'],
    archive,
    atcRules: [
      { id: 'r1', pattern: 'github.com', spaceId: 's2', enabled: true },
      { id: 'r2', pattern: '*.google.com/*', spaceId: 's1', enabled: false },
    ],
    profiles: { pr1: createProfile('Work', '#ff0000', 'pr1') },
  };
}

function expectedAfterLoad(state: CoreState): CoreState {
  const tabs: Record<string, Tab> = {};
  for (const t of Object.values(state.tabs))
    tabs[t.id] = { ...t, loaded: false, loading: false, audible: false };
  return { ...state, tabs };
}

describe.skipIf(!sqliteAvailable)('StateRepo', () => {
  let db: Db;

  beforeEach(() => {
    db = openDatabase(':memory:');
    expect(migrate(db)).toBe(1);
  });

  afterEach(() => {
    db.close();
  });

  it('load() on an empty database returns a default state with one space', () => {
    const state = new StateRepo(db).load();
    expect(state.spaceOrder).toHaveLength(1);
    expect(state.activeSpaceId).toBe(state.spaceOrder[0]);
    expect(state.spaces[state.activeSpaceId]?.name).toBe('Home');
    expect(state).toMatchObject({
      tabs: {},
      folders: {},
      favorites: [],
      mru: [],
      archive: [],
      atcRules: [],
      profiles: {},
    });
  });

  it('round-trips a full state through save() and load()', () => {
    const state = fixtureState();
    new StateRepo(db).save(state);
    const loaded = new StateRepo(db).load();
    expect(loaded).toEqual(expectedAfterLoad(state));
    expect(loaded.spaceOrder).toEqual(['s2', 's1']);
    expect(loaded.archive.map((a) => a.id)).toEqual(['a2', 'a1']);
    expect(loaded.atcRules.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('a second save() with unchanged slices succeeds and keeps the data', () => {
    const repo = new StateRepo(db);
    const state = fixtureState();
    repo.save(state);
    expect(() => repo.save(state)).not.toThrow();
    expect(repo.load()).toEqual(expectedAfterLoad(state));
  });

  it('persists only the slices that changed by reference', () => {
    const repo = new StateRepo(db);
    const state = fixtureState();
    repo.save(state);
    const next: CoreState = {
      ...state,
      mru: ['fav', 'h1'],
      activeSpaceId: 's2',
      archive: [],
      tabs: { ...state.tabs, h1: { ...tab('h1', 's1', 'today'), title: 'Renamed' } },
    };
    repo.save(next);
    const loaded = new StateRepo(db).load();
    expect(loaded).toEqual(expectedAfterLoad(next));
    expect(loaded.tabs.h1?.title).toBe('Renamed');
    expect(loaded.archive).toEqual([]);
  });

  it('drops dangling favorites / mru ids and falls back to the first space when meta is stale', () => {
    const repo = new StateRepo(db);
    const state = fixtureState();
    repo.save({ ...state, favorites: ['fav', 'ghost'], mru: ['ghost', 'h1'], activeSpaceId: 'gone' });
    const loaded = new StateRepo(db).load();
    expect(loaded.favorites).toEqual(['fav']);
    expect(loaded.mru).toEqual(['h1']);
    expect(loaded.activeSpaceId).toBe('s2');
  });
});
