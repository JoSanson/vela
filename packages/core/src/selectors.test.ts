import { describe, expect, it } from 'vitest';
import { createFolder, createSpace, createTab } from './factories';
import { reduce } from './reducer';
import {
  activeSpace,
  activeTab,
  displayTitle,
  favoriteTabs,
  folderPath,
  mruTabs,
  pickNextActive,
  pinnedTree,
  spaceTabs,
  tabCount,
  todayTabs,
  visibleTabIds,
} from './selectors';
import type { CoreState, Id, TabKind } from './types';

const NOW = 1_700_000_000_000;

function baseState(): CoreState {
  return {
    spaces: { s1: createSpace({ id: 's1', name: 'Home', now: NOW }) },
    spaceOrder: ['s1'],
    activeSpaceId: 's1',
    tabs: {},
    folders: {},
    favorites: [],
    mru: [],
    archive: [],
    atcRules: [],
    profiles: {},
  };
}

function open(
  state: CoreState,
  id: Id,
  spaceId: Id | null,
  kind: TabKind = 'today',
  activate = true,
): CoreState {
  const tab = createTab({ id, url: `https://${id}.example.com/`, spaceId, kind, now: NOW });
  return reduce(state, { type: 'tab/open', tab, activate });
}

/** s1: pinned = [p0, f1(t1, f2(t2))], today = [t3]; f2 collapsed. */
function tree(): CoreState {
  let s = baseState();
  for (const id of ['t1', 't2', 't3']) s = open(s, id, 's1');
  s = open(s, 'p0', 's1', 'pinned', false);
  s = reduce(s, { type: 'folder/create', folder: createFolder({ id: 'f1', spaceId: 's1', name: 'F1' }) });
  s = reduce(s, {
    type: 'tab/move',
    id: 't1',
    to: { container: { kind: 'folder', folderId: 'f1' }, index: 0 },
    now: NOW,
  });
  s = reduce(s, {
    type: 'folder/create',
    folder: createFolder({ id: 'f2', spaceId: 's1', name: 'F2' }),
    parentFolderId: 'f1',
  });
  s = reduce(s, {
    type: 'tab/move',
    id: 't2',
    to: { container: { kind: 'folder', folderId: 'f2' }, index: 0 },
    now: NOW,
  });
  s = reduce(s, { type: 'folder/update', id: 'f2', patch: { collapsed: true } });
  return s;
}

describe('activeSpace / activeTab', () => {
  it('resolves the active space and tab, or undefined', () => {
    const empty = baseState();
    expect(activeSpace(empty)?.id).toBe('s1');
    expect(activeTab(empty)).toBeUndefined();
    const s = open(empty, 't1', 's1');
    expect(activeTab(s)?.id).toBe('t1');
    expect(activeSpace({ ...s, activeSpaceId: 'nope' })).toBeUndefined();
    expect(activeTab({ ...s, activeSpaceId: 'nope' })).toBeUndefined();
  });
});

describe('visibleTabIds', () => {
  it('returns the active tab, split panes, or nothing', () => {
    const empty = baseState();
    expect(visibleTabIds(empty)).toEqual([]);
    expect(visibleTabIds(empty, 'nope')).toEqual([]);
    let s = open(open(empty, 't1', 's1'), 't2', 's1');
    expect(visibleTabIds(s)).toEqual(['t2']);
    s = reduce(s, { type: 'split/add', spaceId: 's1', tabId: 't1' });
    expect(visibleTabIds(s, 's1')).toEqual(['t2', 't1']);
  });
});

describe('pinnedTree', () => {
  it('flattens with depth and hides collapsed children by default', () => {
    const s = tree();
    const items = pinnedTree(s, 's1').map((i) =>
      i.kind === 'tab' ? `${i.tab.id}@${i.depth}` : `${i.folder.id}@${i.depth}`,
    );
    expect(items).toEqual(['p0@0', 'f1@0', 't1@1', 'f2@1']);
    const all = pinnedTree(s, 's1', true).map((i) => (i.kind === 'tab' ? i.tab.id : i.folder.id));
    expect(all).toEqual(['p0', 'f1', 't1', 'f2', 't2']);
  });

  it('skips dangling ids and unknown spaces', () => {
    const s = tree();
    const dangling: CoreState = {
      ...s,
      spaces: {
        ...s.spaces,
        s1: { ...(s.spaces.s1 ?? createSpace({ name: 'x' })), pinned: ['ghost', 'p0'] },
      },
    };
    expect(pinnedTree(dangling, 's1').map((i) => i.kind)).toEqual(['tab']);
    expect(pinnedTree(s, 'nope')).toEqual([]);
  });
});

describe('tab lists', () => {
  it('spaceTabs, todayTabs, favoriteTabs and tabCount', () => {
    let s = tree();
    s = open(s, 'fav', null, 'favorite');
    expect(
      spaceTabs(s, 's1')
        .map((t) => t.id)
        .sort(),
    ).toEqual(['p0', 't1', 't2', 't3']);
    expect(todayTabs(s, 's1').map((t) => t.id)).toEqual(['t3']);
    expect(todayTabs(s, 'nope')).toEqual([]);
    expect(favoriteTabs(s).map((t) => t.id)).toEqual(['fav']);
    expect(tabCount(s)).toBe(5);
    const dangling: CoreState = {
      ...s,
      favorites: ['ghost', 'fav'],
      spaces: { ...s.spaces, s1: { ...(s.spaces.s1 ?? createSpace({ name: 'x' })), today: ['ghost', 't3'] } },
    };
    expect(favoriteTabs(dangling).map((t) => t.id)).toEqual(['fav']);
    // Favorites belong to a profile: a Space only shows the ones of its own profile.
    const withProfile = reduce(s, {
      type: 'space/create',
      space: createSpace({ id: 's2', name: 'Work', profileId: 'p1', now: NOW }),
    });
    const owned = reduce(withProfile, {
      type: 'tab/open',
      tab: createTab({
        id: 'fav-p1',
        url: 'https://w.example.com/',
        spaceId: null,
        kind: 'favorite',
        profileId: 'p1',
        now: NOW,
      }),
      activate: false,
    });
    expect(favoriteTabs(owned, 's1').map((t) => t.id)).toEqual(['fav']);
    expect(favoriteTabs(owned, 's2').map((t) => t.id)).toEqual(['fav-p1']);
    expect(todayTabs(dangling, 's1').map((t) => t.id)).toEqual(['t3']);
  });
});

describe('displayTitle', () => {
  it('prefers customTitle, then title, then hostname, then url, then "New tab"', () => {
    expect(displayTitle({ customTitle: 'Mine', title: 'Page', url: 'https://www.example.com/x' })).toBe(
      'Mine',
    );
    expect(displayTitle({ customTitle: null, title: 'Page', url: 'https://www.example.com/x' })).toBe('Page');
    expect(displayTitle({ customTitle: '', title: '', url: 'https://www.example.com/x' })).toBe(
      'example.com',
    );
    expect(displayTitle({ customTitle: null, title: '', url: 'https://docs.github.com/a' })).toBe(
      'docs.github.com',
    );
    expect(displayTitle({ customTitle: null, title: '', url: 'file:///tmp/x' })).toBe('file:///tmp/x');
    expect(displayTitle({ customTitle: null, title: '', url: 'not a url' })).toBe('not a url');
    expect(displayTitle({ customTitle: null, title: '', url: '' })).toBe('New tab');
  });
});

describe('mruTabs', () => {
  it('follows mru order, skips missing ids and honours the limit', () => {
    let s = baseState();
    for (let i = 1; i <= 15; i++) s = open(s, `t${i}`, 's1');
    expect(mruTabs(s).map((t) => t.id)).toEqual(Array.from({ length: 12 }, (_, i) => `t${15 - i}`));
    expect(mruTabs(s, 3).map((t) => t.id)).toEqual(['t15', 't14', 't13']);
    const dangling: CoreState = { ...s, mru: ['ghost', 't1', 't2'] };
    expect(mruTabs(dangling, 2).map((t) => t.id)).toEqual(['t1', 't2']);
  });
});

describe('folderPath', () => {
  it('returns the root-to-leaf chain', () => {
    const s = tree();
    expect(folderPath(s, 'f2').map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(folderPath(s, 'f1').map((f) => f.id)).toEqual(['f1']);
    expect(folderPath(s, 'nope')).toEqual([]);
  });

  it('terminates on cycles', () => {
    const s = baseState();
    const cyclic: CoreState = {
      ...s,
      folders: {
        a: { ...createFolder({ id: 'a', spaceId: 's1', name: 'a' }), children: ['b'] },
        b: { ...createFolder({ id: 'b', spaceId: 's1', name: 'b' }), children: ['a'] },
      },
    };
    expect(folderPath(cyclic, 'a').map((f) => f.id)).toEqual(['b', 'a']);
  });
});

describe('pickNextActive', () => {
  it('prefers the most recent tab of the same space', () => {
    let s = tree();
    s = reduce(s, { type: 'tab/activate', id: 't1', now: NOW + 1 });
    s = reduce(s, { type: 'tab/activate', id: 't3', now: NOW + 2 });
    expect(pickNextActive(s, 's1', 't3')).toBe('t1');
  });

  it('ignores favorites and other spaces in mru', () => {
    let s = reduce(tree(), { type: 'space/create', space: createSpace({ id: 's2', name: 'W', now: NOW }) });
    s = open(s, 'u1', 's2');
    s = open(s, 'fav', null, 'favorite');
    const mruOnly: CoreState = { ...s, mru: ['fav', 'u1', 't3'] };
    expect(pickNextActive(mruOnly, 's1', 'p0')).toBe('t3');
  });

  it('falls back to list neighbours (today then pinned tree), then null', () => {
    const s: CoreState = { ...tree(), mru: [] };
    expect(pickNextActive(s, 's1', 't3')).toBe('p0');
    expect(pickNextActive(s, 's1', 't1')).toBe('t2');
    expect(pickNextActive(s, 's1', 't2')).toBe('t1');
    expect(pickNextActive(s, 's1', 'zz')).toBe('t3');
    expect(pickNextActive(s, 'nope', 't3')).toBeNull();
    const lone: CoreState = { ...open(baseState(), 'only', 's1'), mru: [] };
    expect(pickNextActive(lone, 's1', 'only')).toBeNull();
  });
});
