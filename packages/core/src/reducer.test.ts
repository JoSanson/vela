import { describe, expect, it } from 'vitest';
import type { CoreAction } from './actions';
import { createDefaultState, createFolder, createProfile, createSpace, createTab } from './factories';
import { findContainer, foldInstances, reduce } from './reducer';
import { activeItemId, activeTab, visibleTabIds } from './selectors';
import type { CoreState, Folder, Id, Space, Tab, TabKind } from './types';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function baseState(): CoreState {
  const home = createSpace({ id: 's1', name: 'Home', now: NOW });
  return {
    spaces: { s1: home },
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

function withSpace(state: CoreState, id: Id, name = id): CoreState {
  return reduce(state, { type: 'space/create', space: createSpace({ id, name, now: NOW }) });
}

interface OpenOpts {
  kind?: TabKind;
  activate?: boolean;
  now?: number;
  url?: string;
  index?: number;
}

function open(state: CoreState, id: Id, spaceId: Id | null, opts: OpenOpts = {}): CoreState {
  const tab = createTab({
    id,
    url: opts.url ?? `https://${id}.example.com/`,
    spaceId,
    kind: opts.kind ?? 'today',
    now: opts.now ?? NOW,
  });
  const action: CoreAction = {
    type: 'tab/open',
    tab,
    activate: opts.activate ?? true,
    ...(opts.index === undefined ? {} : { index: opts.index }),
  };
  return reduce(state, action);
}

function sp(state: CoreState, id: Id = 's1'): Space {
  const s = state.spaces[id];
  if (!s) throw new Error(`missing space ${id}`);
  return s;
}

function tb(state: CoreState, id: Id): Tab {
  const t = state.tabs[id];
  if (!t) throw new Error(`missing tab ${id}`);
  return t;
}

function fd(state: CoreState, id: Id): Folder {
  const f = state.folders[id];
  if (!f) throw new Error(`missing folder ${id}`);
  return f;
}

/** s1 with today tabs t1..tN opened in order (active = tN, mru = [tN..t1]). */
function withToday(n: number, state = baseState()): CoreState {
  let s = state;
  for (let i = 1; i <= n; i++) s = open(s, `t${i}`, 's1', { now: NOW + i });
  return s;
}

/** Nested fixture: s1.pinned = [p0, f1]; f1 = [t1, f2]; f2 = [t2]; today = [t3]. */
function nested(): CoreState {
  let s = withToday(3);
  s = open(s, 'p0', 's1', { kind: 'pinned', activate: false });
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
  return s;
}

describe('state/replace', () => {
  it('returns the provided state as-is', () => {
    const a = baseState();
    const b = createDefaultState(NOW);
    expect(reduce(a, { type: 'state/replace', state: b })).toBe(b);
  });
});

describe('tab/open', () => {
  it('opens a today tab at the top and activates it', () => {
    const s = withToday(2);
    expect(sp(s).today).toEqual(['t2', 't1']);
    expect(sp(s).activeTabId).toBe('t2');
    expect(s.mru).toEqual(['t2', 't1']);
    expect(tb(s, 't2').lastActiveAt).toBe(NOW + 2);
    expect(activeTab(s)?.id).toBe('t2');
  });

  it('respects activate: false', () => {
    const s = open(withToday(1), 'bg', 's1', { activate: false });
    expect(sp(s).today).toEqual(['bg', 't1']);
    expect(sp(s).activeTabId).toBe('t1');
    expect(s.mru).toEqual(['t1']);
  });

  it('honours an explicit index for today tabs', () => {
    const s = open(withToday(2), 'mid', 's1', { index: 1, activate: false });
    expect(sp(s).today).toEqual(['t2', 'mid', 't1']);
  });

  it('appends pinned tabs to the end of pinned', () => {
    let s = open(baseState(), 'p1', 's1', { kind: 'pinned' });
    s = open(s, 'p2', 's1', { kind: 'pinned' });
    expect(sp(s).pinned).toEqual(['p1', 'p2']);
    expect(sp(s).today).toEqual([]);
    expect(tb(s, 'p1').homeUrl).toBe('https://p1.example.com/');
  });

  it('favoriting a tab gives it the profile of its Space; moving it back drops it', () => {
    let s = reduce(baseState(), {
      type: 'space/create',
      space: createSpace({ id: 's2', name: 'Work', profileId: 'p1', now: NOW }),
    });
    s = open(s, 'w1', 's2');
    s = reduce(s, { type: 'tab/favorite', id: 'w1' });
    expect(s.tabs.w1).toMatchObject({ kind: 'favorite', spaceId: null, profileId: 'p1' });
    s = reduce(s, {
      type: 'tab/move',
      id: 'w1',
      to: { container: { kind: 'favorites' }, index: 0 },
      now: NOW,
    });
    expect(s.tabs.w1?.profileId).toBe('p1');
    s = reduce(s, {
      type: 'tab/move',
      id: 'w1',
      to: { container: { kind: 'today', spaceId: 's1' }, index: 0 },
      now: NOW,
    });
    expect(s.tabs.w1).toMatchObject({ kind: 'today', spaceId: 's1', profileId: null });
  });

  it('appends favorites globally and activates them in the active space', () => {
    let s = open(baseState(), 'fav1', null, { kind: 'favorite' });
    s = open(s, 'fav2', null, { kind: 'favorite', index: 0 });
    expect(s.favorites).toEqual(['fav2', 'fav1']);
    expect(tb(s, 'fav1').spaceId).toBeNull();
    expect(sp(s).activeTabId).toBe('fav2');
    expect(s.activeSpaceId).toBe('s1');
  });

  it('falls back to the active space when spaceId is null for a today tab', () => {
    const s = open(baseState(), 'x', null);
    expect(tb(s, 'x').spaceId).toBe('s1');
    expect(sp(s).today).toEqual(['x']);
  });

  it('is a no-op for an unknown space or a duplicate id', () => {
    const s = withToday(1);
    expect(open(s, 'ghost', 'nope')).toBe(s);
    expect(open(s, 't1', 's1')).toBe(s);
  });
});

describe('tab/activate and MRU', () => {
  it('orders mru most-recent first and switches the active space', () => {
    let s = withSpace(withToday(3), 's2');
    s = open(s, 'u1', 's2', { now: NOW + 10 });
    expect(s.activeSpaceId).toBe('s2');
    expect(s.mru).toEqual(['u1', 't3', 't2', 't1']);
    s = reduce(s, { type: 'tab/activate', id: 't1', now: NOW + 20 });
    expect(s.activeSpaceId).toBe('s1');
    expect(sp(s).activeTabId).toBe('t1');
    expect(tb(s, 't1').lastActiveAt).toBe(NOW + 20);
    expect(s.mru).toEqual(['t1', 'u1', 't3', 't2']);
  });

  it('activating a favorite keeps the current space', () => {
    let s = withSpace(withToday(1), 's2');
    s = open(s, 'fav', null, { kind: 'favorite', activate: false });
    s = reduce(s, { type: 'space/activate', id: 's2', now: NOW });
    s = reduce(s, { type: 'tab/activate', id: 'fav', now: NOW });
    expect(s.activeSpaceId).toBe('s2');
    expect(sp(s, 's2').activeTabId).toBe('fav');
    expect(sp(s, 's1').activeTabId).toBe('t1');
  });

  it('stamps the tab being left, so a long-used tab does not look idle once hidden', () => {
    let s = withSpace(withToday(2), 's2');
    s = open(s, 'u1', 's2', { now: NOW + 10 });
    s = reduce(s, { type: 'tab/activate', id: 't1', now: NOW + 5000 });
    expect(tb(s, 'u1').lastActiveAt).toBe(NOW + 5000);
    s = reduce(s, { type: 'tab/activate', id: 't2', now: NOW + 9000 });
    expect(tb(s, 't1').lastActiveAt).toBe(NOW + 9000);
    s = reduce(s, { type: 'space/activate', id: 's2', now: NOW + 12000 });
    expect(tb(s, 't2').lastActiveAt).toBe(NOW + 12000);
  });

  it('is a no-op when the tab references a missing space', () => {
    const s = withToday(1);
    const broken: CoreState = { ...s, tabs: { ...s.tabs, t1: { ...tb(s, 't1'), spaceId: 'gone' } } };
    expect(reduce(broken, { type: 'tab/activate', id: 't1', now: NOW })).toBe(broken);
  });
});

describe('tab/close', () => {
  it('archives with reason closed by default and activates the MRU neighbour', () => {
    const s = withToday(3);
    const next = reduce(s, { type: 'tab/close', id: 't3', now: NOW + 10 });
    expect(next.tabs.t3).toBeUndefined();
    expect(sp(next).today).toEqual(['t2', 't1']);
    expect(sp(next).activeTabId).toBe('t2');
    expect(next.mru).toEqual(['t2', 't1']);
    expect(next.archive).toHaveLength(1);
    expect(next.archive[0]).toMatchObject({
      id: 't3',
      spaceId: 's1',
      spaceName: 'Home',
      url: 'https://t3.example.com/',
      archivedAt: NOW + 10,
      reason: 'closed',
    });
  });

  it('accepts an explicit reason and uses customTitle for the archive title', () => {
    let s = withToday(1);
    s = reduce(s, { type: 'tab/update', id: 't1', patch: { title: 'Raw', customTitle: 'Mine' } });
    const next = reduce(s, { type: 'tab/close', id: 't1', now: NOW, reason: 'manual' });
    expect(next.archive[0]?.reason).toBe('manual');
    expect(next.archive[0]?.title).toBe('Mine');
  });

  it('does not archive vela:// or empty urls', () => {
    let s = open(baseState(), 'internal', 's1', { url: 'vela://history' });
    s = open(s, 'blank', 's1', { url: '' });
    s = reduce(s, { type: 'tab/close', id: 'internal', now: NOW });
    s = reduce(s, { type: 'tab/close', id: 'blank', now: NOW });
    expect(s.archive).toEqual([]);
    expect(Object.keys(s.tabs)).toEqual([]);
  });

  it('replaces an older archive entry with the same id', () => {
    const s = withToday(1);
    const stale: CoreState = {
      ...s,
      archive: [
        {
          id: 't1',
          spaceId: 's1',
          spaceName: 'Old',
          url: 'x',
          title: '',
          favicon: null,
          archivedAt: 1,
          reason: 'auto',
        },
      ],
    };
    const next = reduce(stale, { type: 'tab/close', id: 't1', now: NOW });
    expect(next.archive).toHaveLength(1);
    expect(next.archive[0]?.spaceName).toBe('Home');
  });

  it('falls back to list neighbours when mru is empty (next, then previous)', () => {
    let s = baseState();
    for (const id of ['a', 'b', 'c', 'd'])
      s = open(s, id, 's1', { activate: false, index: Number.MAX_SAFE_INTEGER });
    expect(sp(s).today).toEqual(['a', 'b', 'c', 'd']);
    s = reduce(s, { type: 'space/setActiveTab', spaceId: 's1', tabId: 'b' });
    const afterB = reduce(s, { type: 'tab/close', id: 'b', now: NOW });
    expect(sp(afterB).activeTabId).toBe('c');
    const last = reduce(s, { type: 'space/setActiveTab', spaceId: 's1', tabId: 'd' });
    const afterD = reduce(last, { type: 'tab/close', id: 'd', now: NOW });
    expect(sp(afterD).activeTabId).toBe('c');
  });

  it('leaves activeTabId null when nothing remains', () => {
    const s = withToday(1);
    const next = reduce(s, { type: 'tab/close', id: 't1', now: NOW });
    expect(sp(next).activeTabId).toBeNull();
    expect(sp(next).today).toEqual([]);
  });

  it('removes the tab from splits, favorites and folders', () => {
    let s = nested();
    s = reduce(s, { type: 'split/add', spaceId: 's1', tabId: 't2' });
    s = reduce(s, { type: 'split/add', spaceId: 's1', tabId: 'p0' });
    expect(sp(s).split?.panes).toEqual(['t3', 't2', 'p0']);
    s = reduce(s, { type: 'tab/close', id: 't2', now: NOW });
    expect(sp(s).split).toEqual({ panes: ['t3', 'p0'], sizes: [0.5, 0.5] });
    expect(fd(s, 'f2').children).toEqual([]);
    s = reduce(s, { type: 'tab/close', id: 'p0', now: NOW });
    expect(sp(s).split).toBeNull();
    expect(sp(s).pinned).toEqual(['f1']);
    s = open(s, 'fav', null, { kind: 'favorite' });
    s = reduce(s, { type: 'tab/close', id: 'fav', now: NOW });
    expect(s.favorites).toEqual([]);
    expect(s.archive[0]).toMatchObject({ id: 'fav', spaceId: null, spaceName: 'Favorites' });
  });

  it('closing an active favorite re-activates a space tab', () => {
    let s = withToday(1);
    s = open(s, 'fav', null, { kind: 'favorite' });
    expect(sp(s).activeTabId).toBe('fav');
    s = reduce(s, { type: 'tab/close', id: 'fav', now: NOW });
    expect(sp(s).activeTabId).toBe('t1');
  });
});

describe('tab/update and tab/reset', () => {
  it('merges patches', () => {
    const s = reduce(withToday(1), {
      type: 'tab/update',
      id: 't1',
      patch: { title: 'Hello', audible: true, zoom: 1.5, url: 'https://t1.example.com/page' },
    });
    expect(tb(s, 't1')).toMatchObject({
      title: 'Hello',
      audible: true,
      zoom: 1.5,
      url: 'https://t1.example.com/page',
    });
  });

  it('reset returns a pinned tab to its home url and clears runtime flags', () => {
    let s = open(baseState(), 'p', 's1', { kind: 'pinned' });
    s = reduce(s, {
      type: 'tab/update',
      id: 'p',
      patch: {
        url: 'https://p.example.com/deep',
        loaded: true,
        sleeping: true,
        loading: true,
        canGoBack: true,
        canGoForward: true,
        audible: true,
        scrollY: 300,
      },
    });
    s = reduce(s, { type: 'tab/reset', id: 'p' });
    expect(tb(s, 'p')).toMatchObject({
      url: 'https://p.example.com/',
      loaded: false,
      sleeping: false,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      audible: false,
      scrollY: 0,
    });
  });

  it('reset keeps the current url for today tabs (no home)', () => {
    let s = withToday(1);
    s = reduce(s, { type: 'tab/update', id: 't1', patch: { url: 'https://elsewhere.test/' } });
    s = reduce(s, { type: 'tab/reset', id: 't1' });
    expect(tb(s, 't1').url).toBe('https://elsewhere.test/');
  });
});

describe('tab/pin, tab/unpin, tab/favorite', () => {
  it('pins a today tab (append by default, or at index)', () => {
    let s = withToday(3);
    s = reduce(s, { type: 'tab/pin', id: 't1' });
    s = reduce(s, { type: 'tab/pin', id: 't2', index: 0 });
    expect(sp(s).pinned).toEqual(['t2', 't1']);
    expect(sp(s).today).toEqual(['t3']);
    expect(tb(s, 't1')).toMatchObject({
      kind: 'pinned',
      homeUrl: 'https://t1.example.com/',
      lastActiveAt: NOW + 2,
    });
  });

  it('pin is a no-op for pinned, favorite or unknown tabs', () => {
    let s = open(withToday(1), 'p', 's1', { kind: 'pinned' });
    s = open(s, 'fav', null, { kind: 'favorite' });
    expect(reduce(s, { type: 'tab/pin', id: 'p' })).toBe(s);
    expect(reduce(s, { type: 'tab/pin', id: 'fav' })).toBe(s);
    expect(reduce(s, { type: 'tab/pin', id: 'nope' })).toBe(s);
  });

  it('unpins to the top of today, clears homeUrl and bumps lastActiveAt', () => {
    let s = withToday(1);
    s = open(s, 'p', 's1', { kind: 'pinned', activate: false });
    s = reduce(s, { type: 'tab/unpin', id: 'p', now: NOW + 50 });
    expect(sp(s).today).toEqual(['p', 't1']);
    expect(sp(s).pinned).toEqual([]);
    expect(tb(s, 'p')).toMatchObject({ kind: 'today', homeUrl: null, lastActiveAt: NOW + 50 });
  });

  it('unpins a tab nested in a folder', () => {
    let s = nested();
    s = reduce(s, { type: 'tab/unpin', id: 't2', now: NOW });
    expect(fd(s, 'f2').children).toEqual([]);
    expect(sp(s).today).toEqual(['t2', 't3']);
  });

  it('unpins a favorite into the active space', () => {
    let s = withSpace(withToday(1), 's2');
    s = open(s, 'fav', null, { kind: 'favorite', activate: false });
    s = reduce(s, { type: 'space/activate', id: 's2', now: NOW });
    s = reduce(s, { type: 'tab/unpin', id: 'fav', now: NOW });
    expect(s.favorites).toEqual([]);
    expect(sp(s, 's2').today).toEqual(['fav']);
    expect(tb(s, 'fav')).toMatchObject({ kind: 'today', spaceId: 's2' });
  });

  it('unpin is a no-op for today or unknown tabs', () => {
    const s = withToday(1);
    expect(reduce(s, { type: 'tab/unpin', id: 't1', now: NOW })).toBe(s);
    expect(reduce(s, { type: 'tab/unpin', id: 'nope', now: NOW })).toBe(s);
  });

  it('favorites a today tab: global, no space, home set, stays visible in its space', () => {
    let s = withToday(2);
    s = reduce(s, { type: 'split/add', spaceId: 's1', tabId: 't1' });
    s = reduce(s, { type: 'tab/favorite', id: 't2' });
    expect(s.favorites).toEqual(['t2']);
    expect(sp(s).today).toEqual(['t1']);
    // Favorites are global, so the page the user is looking at does not change.
    expect(sp(s).split?.panes).toEqual(['t2', 't1']);
    expect(sp(s).activeTabId).toBe('t2');
    expect(tb(s, 't2')).toMatchObject({
      kind: 'favorite',
      spaceId: null,
      homeUrl: 'https://t2.example.com/',
    });
  });

  it('favorite honours index and is a no-op for favorites / unknown', () => {
    let s = withToday(2);
    s = reduce(s, { type: 'tab/favorite', id: 't1' });
    s = reduce(s, { type: 'tab/favorite', id: 't2', index: 0 });
    expect(s.favorites).toEqual(['t2', 't1']);
    expect(reduce(s, { type: 'tab/favorite', id: 't1' })).toBe(s);
    expect(reduce(s, { type: 'tab/favorite', id: 'nope' })).toBe(s);
  });
});

describe('tab/move', () => {
  it('reorders within today', () => {
    const s = reduce(withToday(3), {
      type: 'tab/move',
      id: 't1',
      to: { container: { kind: 'today', spaceId: 's1' }, index: 0 },
      now: NOW + 99,
    });
    expect(sp(s).today).toEqual(['t1', 't3', 't2']);
    expect(tb(s, 't1').lastActiveAt).toBe(NOW + 99);
    expect(sp(s).activeTabId).toBe('t3');
  });

  it('moves an active tab to another space and re-activates in the source', () => {
    let s = withSpace(withToday(3), 's2');
    s = reduce(s, { type: 'split/add', spaceId: 's1', tabId: 't1' });
    s = reduce(s, {
      type: 'tab/move',
      id: 't3',
      to: { container: { kind: 'today', spaceId: 's2' }, index: 0 },
      now: NOW,
    });
    expect(sp(s, 's1').today).toEqual(['t2', 't1']);
    expect(sp(s, 's1').activeTabId).toBe('t2');
    expect(sp(s, 's1').split).toBeNull();
    expect(sp(s, 's2').today).toEqual(['t3']);
    expect(sp(s, 's2').activeTabId).toBeNull();
    expect(tb(s, 't3').spaceId).toBe('s2');
  });

  it('moves into a folder as pinned with homeUrl', () => {
    const s = nested();
    expect(fd(s, 'f1').children).toEqual(['t1', 'f2']);
    expect(fd(s, 'f2').children).toEqual(['t2']);
    expect(tb(s, 't1')).toMatchObject({ kind: 'pinned', spaceId: 's1', homeUrl: 'https://t1.example.com/' });
    expect(sp(s).today).toEqual(['t3']);
  });

  it('moves a favorite into a space pinned list', () => {
    let s = withSpace(withToday(1), 's2');
    s = open(s, 'fav', null, { kind: 'favorite' });
    s = reduce(s, {
      type: 'tab/move',
      id: 'fav',
      to: { container: { kind: 'pinned', spaceId: 's2' }, index: 0 },
      now: NOW,
    });
    expect(s.favorites).toEqual([]);
    expect(sp(s, 's2').pinned).toEqual(['fav']);
    expect(tb(s, 'fav')).toMatchObject({ kind: 'pinned', spaceId: 's2' });
  });

  it('preserves the original homeUrl across pinned containers, drops it in today', () => {
    let s = withSpace(withToday(1), 's2');
    s = reduce(s, { type: 'tab/pin', id: 't1' });
    s = reduce(s, { type: 'tab/update', id: 't1', patch: { url: 'https://t1.example.com/deep' } });
    s = reduce(s, {
      type: 'tab/move',
      id: 't1',
      to: { container: { kind: 'pinned', spaceId: 's2' }, index: 0 },
      now: NOW,
    });
    expect(tb(s, 't1').homeUrl).toBe('https://t1.example.com/');
    s = reduce(s, {
      type: 'tab/move',
      id: 't1',
      to: { container: { kind: 'today', spaceId: 's2' }, index: 0 },
      now: NOW,
    });
    expect(tb(s, 't1').homeUrl).toBeNull();
    s = reduce(s, {
      type: 'tab/move',
      id: 't1',
      to: { container: { kind: 'pinned', spaceId: 's1' }, index: 0 },
      now: NOW,
    });
    expect(tb(s, 't1').homeUrl).toBe('https://t1.example.com/deep');
  });

  it('rejects unknown tabs, folders and spaces', () => {
    const s = withToday(1);
    expect(
      reduce(s, {
        type: 'tab/move',
        id: 'nope',
        to: { container: { kind: 'today', spaceId: 's1' }, index: 0 },
        now: NOW,
      }),
    ).toBe(s);
    expect(
      reduce(s, {
        type: 'tab/move',
        id: 't1',
        to: { container: { kind: 'folder', folderId: 'nope' }, index: 0 },
        now: NOW,
      }),
    ).toBe(s);
    expect(
      reduce(s, {
        type: 'tab/move',
        id: 't1',
        to: { container: { kind: 'pinned', spaceId: 'nope' }, index: 0 },
        now: NOW,
      }),
    ).toBe(s);
  });
});

describe('findContainer', () => {
  it('locates items in every container kind', () => {
    let s = nested();
    s = open(s, 'fav', null, { kind: 'favorite' });
    expect(findContainer(s, 'fav')).toEqual({ container: { kind: 'favorites' }, index: 0 });
    expect(findContainer(s, 't3')).toEqual({ container: { kind: 'today', spaceId: 's1' }, index: 0 });
    expect(findContainer(s, 'f1')).toEqual({ container: { kind: 'pinned', spaceId: 's1' }, index: 1 });
    expect(findContainer(s, 'f2')).toEqual({ container: { kind: 'folder', folderId: 'f1' }, index: 1 });
    expect(findContainer(s, 't2')).toEqual({ container: { kind: 'folder', folderId: 'f2' }, index: 0 });
    expect(findContainer(s, 'nope')).toBeNull();
  });
});

describe('folders', () => {
  it('creates root folders in pinned (append or at index) and nested folders', () => {
    let s = open(baseState(), 'p0', 's1', { kind: 'pinned' });
    s = reduce(s, { type: 'folder/create', folder: createFolder({ id: 'f1', spaceId: 's1', name: 'A' }) });
    s = reduce(s, {
      type: 'folder/create',
      folder: createFolder({ id: 'f0', spaceId: 's1', name: 'B', emoji: '📁' }),
      index: 0,
    });
    expect(sp(s).pinned).toEqual(['f0', 'p0', 'f1']);
    s = reduce(s, {
      type: 'folder/create',
      folder: createFolder({ id: 'f1a', spaceId: 's1', name: 'C' }),
      parentFolderId: 'f1',
    });
    expect(fd(s, 'f1').children).toEqual(['f1a']);
    expect(sp(s).pinned).toEqual(['f0', 'p0', 'f1']);
    expect(fd(s, 'f0').emoji).toBe('📁');
  });

  it('rejects duplicate ids, unknown spaces, unknown or cross-space parents', () => {
    let s = withSpace(baseState(), 's2');
    s = reduce(s, { type: 'folder/create', folder: createFolder({ id: 'f1', spaceId: 's1', name: 'A' }) });
    expect(
      reduce(s, { type: 'folder/create', folder: createFolder({ id: 'f1', spaceId: 's1', name: 'dup' }) }),
    ).toBe(s);
    expect(
      reduce(s, { type: 'folder/create', folder: createFolder({ id: 'fx', spaceId: 'nope', name: 'x' }) }),
    ).toBe(s);
    expect(
      reduce(s, {
        type: 'folder/create',
        folder: createFolder({ id: 'fx', spaceId: 's1', name: 'x' }),
        parentFolderId: 'nope',
      }),
    ).toBe(s);
    expect(
      reduce(s, {
        type: 'folder/create',
        folder: createFolder({ id: 'fx', spaceId: 's2', name: 'x' }),
        parentFolderId: 'f1',
      }),
    ).toBe(s);
  });

  it('updates folder fields', () => {
    const s = reduce(nested(), {
      type: 'folder/update',
      id: 'f1',
      patch: { name: 'Renamed', collapsed: true },
    });
    expect(fd(s, 'f1')).toMatchObject({ name: 'Renamed', collapsed: true });
    expect(reduce(s, { type: 'folder/update', id: 'nope', patch: { name: 'x' } })).toBe(s);
  });

  it('deleting a root folder flattens its children into pinned at its position', () => {
    const s = reduce(nested(), { type: 'folder/delete', id: 'f1' });
    expect(s.folders.f1).toBeUndefined();
    expect(sp(s).pinned).toEqual(['p0', 't1', 'f2']);
    expect(fd(s, 'f2').children).toEqual(['t2']);
    expect(tb(s, 't1').kind).toBe('pinned');
  });

  it('deleting a nested folder flattens into the parent folder', () => {
    const s = reduce(nested(), { type: 'folder/delete', id: 'f2' });
    expect(s.folders.f2).toBeUndefined();
    expect(fd(s, 'f1').children).toEqual(['t1', 't2']);
  });

  it('deleting an orphan folder just removes it', () => {
    const s = nested();
    const orphan: CoreState = {
      ...s,
      folders: { ...s.folders, orphan: createFolder({ id: 'orphan', spaceId: 's1', name: 'o' }) },
    };
    const next = reduce(orphan, { type: 'folder/delete', id: 'orphan' });
    expect(next.folders.orphan).toBeUndefined();
    expect(reduce(next, { type: 'folder/delete', id: 'nope' })).toBe(next);
  });

  it('moves folders within pinned and into other folders', () => {
    let s = nested();
    s = reduce(s, {
      type: 'folder/move',
      id: 'f1',
      to: { container: { kind: 'pinned', spaceId: 's1' }, index: 0 },
    });
    expect(sp(s).pinned).toEqual(['f1', 'p0']);
    s = reduce(s, {
      type: 'folder/move',
      id: 'f2',
      to: { container: { kind: 'pinned', spaceId: 's1' }, index: 1 },
    });
    expect(sp(s).pinned).toEqual(['f1', 'f2', 'p0']);
    expect(fd(s, 'f1').children).toEqual(['t1']);
    s = reduce(s, {
      type: 'folder/move',
      id: 'f1',
      to: { container: { kind: 'folder', folderId: 'f2' }, index: 0 },
    });
    expect(fd(s, 'f2').children).toEqual(['f1', 't2']);
    expect(sp(s).pinned).toEqual(['f2', 'p0']);
  });

  it('rejects moving a folder into itself or its own descendant', () => {
    const s = nested();
    expect(
      reduce(s, {
        type: 'folder/move',
        id: 'f1',
        to: { container: { kind: 'folder', folderId: 'f2' }, index: 0 },
      }),
    ).toBe(s);
    expect(
      reduce(s, {
        type: 'folder/move',
        id: 'f1',
        to: { container: { kind: 'folder', folderId: 'f1' }, index: 0 },
      }),
    ).toBe(s);
  });

  it('rejects today / favorites / other-space targets and unknown ids', () => {
    const s = withSpace(nested(), 's2');
    expect(
      reduce(s, {
        type: 'folder/move',
        id: 'f1',
        to: { container: { kind: 'today', spaceId: 's1' }, index: 0 },
      }),
    ).toBe(s);
    expect(
      reduce(s, { type: 'folder/move', id: 'f1', to: { container: { kind: 'favorites' }, index: 0 } }),
    ).toBe(s);
    expect(
      reduce(s, {
        type: 'folder/move',
        id: 'f1',
        to: { container: { kind: 'pinned', spaceId: 's2' }, index: 0 },
      }),
    ).toBe(s);
    expect(
      reduce(s, {
        type: 'folder/move',
        id: 'nope',
        to: { container: { kind: 'pinned', spaceId: 's1' }, index: 0 },
      }),
    ).toBe(s);
  });
});

describe('spaces', () => {
  it('creates spaces (append or at index) and ignores duplicates', () => {
    let s = withSpace(baseState(), 's2');
    s = reduce(s, {
      type: 'space/create',
      space: createSpace({ id: 's0', name: 'First', now: NOW }),
      index: 0,
    });
    expect(s.spaceOrder).toEqual(['s0', 's1', 's2']);
    expect(s.activeSpaceId).toBe('s1');
    expect(withSpace(s, 's2')).toBe(s);
  });

  it('updates space fields', () => {
    const s = reduce(baseState(), { type: 'space/update', id: 's1', patch: { name: 'Work', emoji: '💼' } });
    expect(sp(s)).toMatchObject({ name: 'Work', emoji: '💼' });
    expect(reduce(s, { type: 'space/update', id: 'nope', patch: { name: 'x' } })).toBe(s);
  });

  it('cannot delete the last space or an unknown one', () => {
    const s = createDefaultState(NOW);
    expect(reduce(s, { type: 'space/delete', id: s.activeSpaceId, now: NOW })).toBe(s);
    const two = withSpace(s, 's2');
    expect(reduce(two, { type: 'space/delete', id: 'nope', now: NOW })).toBe(two);
  });

  it('deleting the active space archives its tabs, drops folders, keeps favorites and picks a neighbour', () => {
    let s = withSpace(withSpace(nested(), 's2'), 's3');
    s = open(s, 'fav', null, { kind: 'favorite', activate: false });
    s = reduce(s, { type: 'space/activate', id: 's1', now: NOW });
    const next = reduce(s, { type: 'space/delete', id: 's1', now: NOW + 5 });
    expect(next.spaceOrder).toEqual(['s2', 's3']);
    expect(next.activeSpaceId).toBe('s2');
    expect(Object.keys(next.tabs)).toEqual(['fav']);
    expect(Object.keys(next.folders)).toEqual([]);
    expect(next.favorites).toEqual(['fav']);
    expect(next.archive.map((a) => a.id).sort()).toEqual(['p0', 't1', 't2', 't3']);
    expect(next.archive.every((a) => a.reason === 'closed' && a.spaceName === 'Home')).toBe(true);
    expect(next.mru).toEqual([]);
  });

  it('deleting the last-positioned active space activates the previous one; inactive delete keeps active', () => {
    const s = withSpace(withSpace(baseState(), 's2'), 's3');
    const active3 = reduce(s, { type: 'space/activate', id: 's3', now: NOW });
    expect(reduce(active3, { type: 'space/delete', id: 's3', now: NOW }).activeSpaceId).toBe('s2');
    const next = reduce(s, { type: 'space/delete', id: 's3', now: NOW });
    expect(next.activeSpaceId).toBe('s1');
    expect(next.spaceOrder).toEqual(['s1', 's2']);
  });

  it('reorders only with a complete permutation', () => {
    const s = withSpace(withSpace(baseState(), 's2'), 's3');
    expect(reduce(s, { type: 'space/reorder', order: ['s3', 's1', 's2'] }).spaceOrder).toEqual([
      's3',
      's1',
      's2',
    ]);
    expect(reduce(s, { type: 'space/reorder', order: ['s3', 's1'] })).toBe(s);
    expect(reduce(s, { type: 'space/reorder', order: ['s3', 's1', 'zz'] })).toBe(s);
  });

  it('activate switches the space and touches its active tab', () => {
    let s = withSpace(withToday(2), 's2');
    s = open(s, 'u1', 's2', { now: NOW + 10 });
    expect(s.mru).toEqual(['u1', 't2', 't1']);
    s = reduce(s, { type: 'space/activate', id: 's1', now: NOW + 20 });
    expect(s.activeSpaceId).toBe('s1');
    expect(s.mru).toEqual(['t2', 'u1', 't1']);
    expect(tb(s, 't2').lastActiveAt).toBe(NOW + 20);
    expect(reduce(s, { type: 'space/activate', id: 'nope', now: NOW })).toBe(s);
  });

  it('activate tolerates spaces without (or with a dangling) active tab', () => {
    let s = withSpace(baseState(), 's2');
    s = reduce(s, { type: 'space/activate', id: 's2', now: NOW });
    expect(s.activeSpaceId).toBe('s2');
    expect(s.mru).toEqual([]);
    const dangling: CoreState = {
      ...s,
      spaces: { ...s.spaces, s2: { ...sp(s, 's2'), activeTabId: 'ghost' } },
    };
    const next = reduce(dangling, { type: 'space/activate', id: 's1', now: NOW });
    expect(next.activeSpaceId).toBe('s1');
    const back = reduce(next, { type: 'space/activate', id: 's2', now: NOW });
    expect(back.mru).toEqual([]);
  });

  it('setActiveTab sets, clears and validates', () => {
    const s = withToday(2);
    expect(sp(reduce(s, { type: 'space/setActiveTab', spaceId: 's1', tabId: 't1' })).activeTabId).toBe('t1');
    expect(sp(reduce(s, { type: 'space/setActiveTab', spaceId: 's1', tabId: null })).activeTabId).toBeNull();
    expect(reduce(s, { type: 'space/setActiveTab', spaceId: 's1', tabId: 'nope' })).toBe(s);
    expect(reduce(s, { type: 'space/setActiveTab', spaceId: 'nope', tabId: 't1' })).toBe(s);
  });
});

describe('archive', () => {
  it('restores into the original space as an active today tab', () => {
    let s = withSpace(withToday(2), 's2');
    s = reduce(s, { type: 'tab/update', id: 't1', patch: { favicon: 'data:ico', title: 'One' } });
    s = reduce(s, { type: 'tab/close', id: 't1', now: NOW });
    s = reduce(s, { type: 'space/activate', id: 's2', now: NOW });
    const next = reduce(s, { type: 'archive/restore', id: 't1', newTabId: 'r1', now: NOW + 7 });
    expect(next.archive).toEqual([]);
    expect(next.activeSpaceId).toBe('s1');
    expect(sp(next, 's1').today).toEqual(['r1', 't2']);
    expect(sp(next, 's1').activeTabId).toBe('r1');
    expect(tb(next, 'r1')).toMatchObject({
      kind: 'today',
      spaceId: 's1',
      url: 'https://t1.example.com/',
      title: 'One',
      favicon: 'data:ico',
      createdAt: NOW + 7,
      lastActiveAt: NOW + 7,
      homeUrl: null,
    });
  });

  it('restores into the active space when the original space is gone', () => {
    let s = withSpace(withToday(1), 's2');
    s = reduce(s, { type: 'space/activate', id: 's2', now: NOW });
    s = reduce(s, { type: 'space/delete', id: 's1', now: NOW });
    expect(s.archive[0]?.id).toBe('t1');
    const next = reduce(s, { type: 'archive/restore', id: 't1', newTabId: 'r1', now: NOW });
    expect(tb(next, 'r1').spaceId).toBe('s2');
    expect(sp(next, 's2').today).toEqual(['r1']);
  });

  it('restore is a no-op for unknown entries or an existing newTabId', () => {
    let s = withToday(2);
    s = reduce(s, { type: 'tab/close', id: 't1', now: NOW });
    expect(reduce(s, { type: 'archive/restore', id: 'nope', newTabId: 'r', now: NOW })).toBe(s);
    expect(reduce(s, { type: 'archive/restore', id: 't1', newTabId: 't2', now: NOW })).toBe(s);
  });

  it('remove, clear and prune', () => {
    let s = withToday(4);
    for (const id of ['t1', 't2', 't3']) s = reduce(s, { type: 'tab/close', id, now: NOW });
    expect(s.archive.map((a) => a.id)).toEqual(['t3', 't2', 't1']);
    expect(reduce(s, { type: 'archive/remove', id: 't2' }).archive.map((a) => a.id)).toEqual(['t3', 't1']);
    expect(reduce(s, { type: 'maintenance/pruneArchive', max: 2 }).archive.map((a) => a.id)).toEqual([
      't3',
      't2',
    ]);
    expect(reduce(s, { type: 'maintenance/pruneArchive', max: 3 })).toBe(s);
    expect(reduce(s, { type: 'archive/clear' }).archive).toEqual([]);
  });
});

describe('maintenance/autoArchive', () => {
  it('archives stale today tabs but respects active, audible, split, keep list, pinned and favorites', () => {
    const OLD = NOW - 10 * DAY;
    let s = withSpace(baseState(), 's2', 'Work');
    s = open(s, 'stale', 's1', { now: OLD, activate: false });
    s = open(s, 'audible', 's1', { now: OLD, activate: false });
    s = open(s, 'kept', 's1', { now: OLD, activate: false });
    s = open(s, 'active', 's1', { now: OLD, activate: false });
    s = open(s, 'inSplit', 's1', { now: OLD, activate: false });
    s = open(s, 'fresh', 's1', { now: NOW, activate: false });
    s = open(s, 'pin', 's1', { now: OLD, kind: 'pinned', activate: false });
    s = open(s, 'fav', null, { now: OLD, kind: 'favorite', activate: false });
    s = open(s, 'other', 's2', { now: OLD, activate: false });
    s = reduce(s, { type: 'tab/update', id: 'audible', patch: { audible: true } });
    s = reduce(s, { type: 'space/setActiveTab', spaceId: 's1', tabId: 'active' });
    s = reduce(s, { type: 'split/add', spaceId: 's1', tabId: 'inSplit' });
    expect(sp(s).split?.panes).toEqual(['active', 'inSplit']);

    const next = reduce(s, {
      type: 'maintenance/autoArchive',
      now: NOW,
      maxAgeMs: DAY,
      keepTabIds: ['kept'],
    });
    expect(Object.keys(next.tabs).sort()).toEqual([
      'active',
      'audible',
      'fav',
      'fresh',
      'inSplit',
      'kept',
      'pin',
    ]);
    expect(next.archive.map((a) => a.id).sort()).toEqual(['other', 'stale']);
    expect(next.archive.every((a) => a.reason === 'auto' && a.archivedAt === NOW)).toBe(true);
    expect(next.archive.find((a) => a.id === 'other')?.spaceName).toBe('Work');
    expect(sp(next, 's2').today).toEqual([]);
  });

  it('is a no-op when nothing is stale', () => {
    const s = withToday(2);
    expect(reduce(s, { type: 'maintenance/autoArchive', now: NOW + 10, maxAgeMs: DAY })).toBe(s);
  });
});

describe('split', () => {
  it('add builds from the active tab, honours index, caps at 4 panes', () => {
    let s = withToday(5);
    s = reduce(s, { type: 'split/add', spaceId: 's1', tabId: 't1' });
    expect(sp(s).split).toEqual({ panes: ['t5', 't1'], sizes: [0.5, 0.5] });
    s = reduce(s, { type: 'split/add', spaceId: 's1', tabId: 't2', index: 0 });
    expect(sp(s).split?.panes).toEqual(['t2', 't5', 't1']);
    expect(sp(s).split?.sizes).toEqual([1 / 3, 1 / 3, 1 / 3]);
    s = reduce(s, { type: 'split/add', spaceId: 's1', tabId: 't3' });
    expect(sp(s).split?.panes).toHaveLength(4);
    expect(reduce(s, { type: 'split/add', spaceId: 's1', tabId: 't4' })).toBe(s);
    expect(reduce(s, { type: 'split/add', spaceId: 's1', tabId: 't1' })).toBe(s);
    expect(visibleTabIds(s)).toEqual(['t2', 't5', 't1', 't3']);
  });

  it('add rejects unknown space/tab, no active tab, or the active tab itself', () => {
    const s = withToday(2);
    expect(reduce(s, { type: 'split/add', spaceId: 'nope', tabId: 't1' })).toBe(s);
    expect(reduce(s, { type: 'split/add', spaceId: 's1', tabId: 'nope' })).toBe(s);
    expect(reduce(s, { type: 'split/add', spaceId: 's1', tabId: 't2' })).toBe(s);
    const noActive = reduce(s, { type: 'space/setActiveTab', spaceId: 's1', tabId: null });
    expect(reduce(noActive, { type: 'split/add', spaceId: 's1', tabId: 't1' })).toBe(noActive);
  });

  it('remove shrinks to equal sizes then clears below two panes', () => {
    let s = withToday(3);
    s = reduce(s, { type: 'split/add', spaceId: 's1', tabId: 't1' });
    s = reduce(s, { type: 'split/add', spaceId: 's1', tabId: 't2' });
    s = reduce(s, { type: 'split/resize', spaceId: 's1', sizes: [1, 1, 2] });
    s = reduce(s, { type: 'split/remove', spaceId: 's1', tabId: 't3' });
    expect(sp(s).split).toEqual({ panes: ['t1', 't2'], sizes: [0.5, 0.5] });
    expect(reduce(s, { type: 'split/remove', spaceId: 's1', tabId: 't3' })).toBe(s);
    s = reduce(s, { type: 'split/remove', spaceId: 's1', tabId: 't1' });
    expect(sp(s).split).toBeNull();
    expect(visibleTabIds(s)).toEqual(['t3']);
  });

  it('resize normalises and validates', () => {
    let s = withToday(3);
    s = reduce(s, { type: 'split/add', spaceId: 's1', tabId: 't1' });
    s = reduce(s, { type: 'split/add', spaceId: 's1', tabId: 't2' });
    expect(
      reduce(s, { type: 'split/resize', spaceId: 's1', sizes: [1, 1, 2] }).spaces.s1?.split?.sizes,
    ).toEqual([0.25, 0.25, 0.5]);
    expect(reduce(s, { type: 'split/resize', spaceId: 's1', sizes: [1, 1] })).toBe(s);
    expect(reduce(s, { type: 'split/resize', spaceId: 's1', sizes: [0, 1, 1] })).toBe(s);
    expect(reduce(s, { type: 'split/resize', spaceId: 's1', sizes: [Number.NaN, 1, 1] })).toBe(s);
    const noSplit = withToday(2);
    expect(reduce(noSplit, { type: 'split/resize', spaceId: 's1', sizes: [1] })).toBe(noSplit);
  });

  it('set validates pane count, uniqueness, existence and normalises sizes', () => {
    const s = withToday(5);
    const set = (panes: string[], sizes: number[]): CoreState =>
      reduce(s, { type: 'split/set', spaceId: 's1', layout: { panes, sizes } });
    expect(sp(set(['t1', 't2'], [3, 1])).split).toEqual({ panes: ['t1', 't2'], sizes: [0.75, 0.25] });
    expect(sp(set(['t1', 't2'], [1])).split?.sizes).toEqual([0.5, 0.5]);
    expect(sp(set(['t1', 't2'], [-1, 2])).split?.sizes).toEqual([0.5, 0.5]);
    expect(set(['t1'], [1])).toBe(s);
    expect(set(['t1', 't2', 't3', 't4', 't5'], [1, 1, 1, 1, 1])).toBe(s);
    expect(set(['t1', 't1'], [1, 1])).toBe(s);
    expect(set(['t1', 'nope'], [1, 1])).toBe(s);
    const withSplit = set(['t1', 't2'], [1, 1]);
    expect(sp(reduce(withSplit, { type: 'split/set', spaceId: 's1', layout: null })).split).toBeNull();
    expect(reduce(withSplit, { type: 'split/set', spaceId: 'nope', layout: null })).toBe(withSplit);
  });
});

describe('atc and profiles', () => {
  it('atc/set stores a copy of the rules', () => {
    const rules = [{ id: 'r1', pattern: 'github.com', spaceId: 's1', enabled: true }];
    const s = reduce(baseState(), { type: 'atc/set', rules });
    expect(s.atcRules).toEqual(rules);
    expect(s.atcRules).not.toBe(rules);
  });

  it('profile create/update/delete, clearing space.profileId on delete', () => {
    const p = createProfile('Work', '#f00', 'pr1');
    let s = reduce(baseState(), { type: 'profile/create', profile: p });
    expect(s.profiles.pr1).toEqual({
      id: 'pr1',
      name: 'Work',
      partition: 'persist:profile-pr1',
      color: '#f00',
    });
    expect(reduce(s, { type: 'profile/create', profile: p })).toBe(s);
    s = reduce(s, { type: 'profile/update', id: 'pr1', patch: { name: 'Perso' } });
    expect(s.profiles.pr1?.name).toBe('Perso');
    expect(reduce(s, { type: 'profile/update', id: 'nope', patch: { name: 'x' } })).toBe(s);
    s = withSpace(s, 's2');
    s = reduce(s, { type: 'space/update', id: 's1', patch: { profileId: 'pr1' } });
    expect(reduce(s, { type: 'profile/delete', id: 'nope' })).toBe(s);
    s = reduce(s, { type: 'profile/delete', id: 'pr1' });
    expect(s.profiles).toEqual({});
    expect(sp(s, 's1').profileId).toBeNull();
    expect(sp(s, 's2').profileId).toBeNull();
  });
});

describe('no-op actions return the same state reference', () => {
  it('for every unknown-id action', () => {
    const s = withToday(1);
    const actions: CoreAction[] = [
      { type: 'tab/activate', id: 'nope', now: NOW },
      { type: 'tab/close', id: 'nope', now: NOW },
      { type: 'tab/update', id: 'nope', patch: { title: 'x' } },
      { type: 'tab/reset', id: 'nope' },
      { type: 'tab/pin', id: 'nope' },
      { type: 'tab/unpin', id: 'nope', now: NOW },
      { type: 'tab/favorite', id: 'nope' },
      { type: 'folder/update', id: 'nope', patch: { name: 'x' } },
      { type: 'folder/delete', id: 'nope' },
      { type: 'space/update', id: 'nope', patch: { name: 'x' } },
      { type: 'space/delete', id: 'nope', now: NOW },
      { type: 'space/activate', id: 'nope', now: NOW },
      { type: 'archive/restore', id: 'nope', newTabId: 'r', now: NOW },
      { type: 'split/remove', spaceId: 's1', tabId: 't1' },
      { type: 'split/resize', spaceId: 's1', sizes: [1] },
      { type: 'maintenance/pruneArchive', max: 10 },
      { type: 'maintenance/autoArchive', now: NOW, maxAgeMs: DAY },
      { type: 'profile/update', id: 'nope', patch: { name: 'x' } },
      { type: 'profile/delete', id: 'nope' },
    ];
    for (const action of actions) expect(reduce(s, action), action.type).toBe(s);
  });
});

describe('per-window Space instances (Arc windows)', () => {
  function withInstance(state: CoreState, id: Id = 'w2', parentId: Id = 's1'): CoreState {
    return reduce(state, {
      type: 'space/create',
      space: { ...createSpace({ id, name: 'ignored', now: NOW }), parentId },
    });
  }

  it('an instance mirrors its root, stays out of spaceOrder, and has its own Today', () => {
    let s = open(baseState(), 'a', 's1');
    s = withInstance(s);
    expect(s.spaceOrder).toEqual(['s1']);
    expect(sp(s, 'w2')).toMatchObject({ name: 'Home', parentId: 's1', today: [], pinned: [] });
    s = open(s, 'b', 'w2');
    expect(sp(s, 'w2').today).toEqual(['b']);
    expect(sp(s, 's1').today).toEqual(['a']);
    expect(sp(s, 's1').activeTabId).toBe('a');
  });

  it('pinned tabs and folders opened from an instance live in the root', () => {
    let s = withInstance(baseState());
    s = open(s, 'p', 'w2', { kind: 'pinned' });
    expect(sp(s, 's1').pinned).toEqual(['p']);
    expect(s.tabs.p?.spaceId).toBe('s1');
    s = reduce(s, { type: 'folder/create', folder: createFolder({ id: 'f', spaceId: 'w2', name: 'F' }) });
    expect(s.folders.f?.spaceId).toBe('s1');
    s = open(s, 't', 'w2');
    s = reduce(s, {
      type: 'tab/move',
      id: 't',
      to: { container: { kind: 'pinned', spaceId: 'w2' }, index: 0 },
      now: NOW,
    });
    expect(sp(s, 's1').pinned[0]).toBe('t');
    expect(s.tabs.t?.spaceId).toBe('s1');
  });

  it('renaming either side renames the root and every instance', () => {
    let s = withInstance(baseState());
    s = reduce(s, { type: 'space/update', id: 'w2', patch: { name: 'Work' } });
    expect(sp(s, 's1').name).toBe('Work');
    expect(sp(s, 'w2').name).toBe('Work');
  });

  it('activating a pinned tab from a window shows it in that window only', () => {
    let s = open(baseState(), 'a', 's1');
    s = open(s, 'p', 's1', { kind: 'pinned', activate: false });
    s = withInstance(s);
    s = reduce(s, { type: 'tab/activate', id: 'p', now: NOW, spaceId: 'w2' });
    expect(sp(s, 'w2').activeTabId).toBe('p');
    expect(sp(s, 's1').activeTabId).toBe('a');
    expect(s.activeSpaceId).toBe('w2');
    s = open(s, 't', 'w2', { activate: false });
    s = reduce(s, { type: 'tab/activate', id: 't', now: NOW, spaceId: 's1' });
    expect(sp(s, 'w2').activeTabId).toBe('t');
  });

  it('a shadow joins no container, stands for its item, and closes with it', () => {
    let s = open(baseState(), 'p', 's1', { kind: 'pinned' });
    s = withInstance(s);
    const shadow = {
      ...createTab({ id: 'sh', url: 'https://p.example.com/', spaceId: 'w2', kind: 'today', now: NOW }),
      shadowOf: 'p',
    };
    s = reduce(s, { type: 'tab/open', tab: shadow, activate: true });
    expect(sp(s, 'w2').today).toEqual([]);
    expect(sp(s, 'w2').activeTabId).toBe('sh');
    expect(activeItemId(s, 'w2')).toBe('p');
    s = reduce(s, { type: 'tab/close', id: 'p', now: NOW });
    expect(s.tabs.sh).toBeUndefined();
    expect(s.archive.map((a) => a.id)).toEqual(['p']);
  });

  it('closing a shadow archives nothing', () => {
    let s = open(baseState(), 'p', 's1', { kind: 'pinned' });
    s = withInstance(s);
    const shadow = {
      ...createTab({ id: 'sh', url: 'https://p.example.com/', spaceId: 'w2', kind: 'today', now: NOW }),
      shadowOf: 'p',
    };
    s = reduce(s, { type: 'tab/open', tab: shadow, activate: true });
    s = reduce(s, { type: 'tab/close', id: 'sh', now: NOW });
    expect(s.archive).toEqual([]);
    expect(s.tabs.p).toBeDefined();
  });

  it('deleting an instance folds its Today into the top of the root', () => {
    let s = open(baseState(), 'a', 's1');
    s = withInstance(s);
    s = open(s, 'b', 'w2');
    s = open(s, 'c', 'w2');
    s = reduce(s, { type: 'space/delete', id: 'w2', now: NOW });
    expect(s.spaces.w2).toBeUndefined();
    expect(sp(s, 's1').today).toEqual(['c', 'b', 'a']);
    expect(s.tabs.b?.spaceId).toBe('s1');
    expect(s.activeSpaceId).toBe('s1');
    expect(s.archive).toEqual([]);
  });

  it('deleting a root folds its instances first, then closes everything', () => {
    let s = withSpace(baseState(), 's2');
    s = withInstance(s, 'w2', 's2');
    s = open(s, 'b', 'w2');
    s = reduce(s, { type: 'space/delete', id: 's2', now: NOW });
    expect(s.spaces.w2).toBeUndefined();
    expect(s.tabs.b).toBeUndefined();
  });

  it('foldInstances leaves the state of one fresh window', () => {
    let s = open(baseState(), 'p', 's1', { kind: 'pinned' });
    s = withInstance(s);
    s = open(s, 'b', 'w2');
    const shadow = {
      ...createTab({ id: 'sh', url: 'https://p.example.com/', spaceId: 's1', kind: 'today', now: NOW }),
      shadowOf: 'p',
    };
    s = reduce(s, { type: 'tab/open', tab: shadow, activate: true });
    s = foldInstances(s);
    expect(Object.keys(s.spaces)).toEqual(['s1']);
    expect(s.tabs.sh).toBeUndefined();
    expect(sp(s, 's1').activeTabId).toBe('p');
    expect(sp(s, 's1').today).toEqual(['b']);
  });

  it('an instance of an unknown or nested root is refused', () => {
    const s = withInstance(baseState());
    expect(withInstance(s, 'w3', 'nope')).toBe(s);
    expect(withInstance(s, 'w3', 'w2')).toBe(s);
  });

  it('auto-archive and tab moves reach instances too', () => {
    let s = withInstance(baseState());
    s = open(s, 'old', 'w2', { now: NOW - 2 * DAY, activate: false });
    s = open(s, 'cur', 'w2');
    s = reduce(s, { type: 'maintenance/autoArchive', now: NOW, maxAgeMs: DAY });
    expect(s.tabs.old).toBeUndefined();
    expect(findContainer(s, 'cur')).toEqual({ container: { kind: 'today', spaceId: 'w2' }, index: 0 });
    s = reduce(s, {
      type: 'tab/move',
      id: 'cur',
      to: { container: { kind: 'today', spaceId: 's1' }, index: 0 },
      now: NOW,
    });
    expect(sp(s, 'w2').today).toEqual([]);
    expect(sp(s, 'w2').activeTabId).toBeNull();
  });
});
