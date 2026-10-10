import { describe, expect, it } from 'vitest';
import { createDefaultState, createSpace, createTab } from './factories';
import { reduce } from './reducer';
import { activeTab, visibleTabIds } from './selectors';

const NOW = 1_700_000_000_000;

function stateWithTabs(n: number) {
  let s = createDefaultState(NOW);
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const tab = createTab({ id: `t${i}`, url: `https://example.com/${i}`, spaceId: s.activeSpaceId, now: NOW + i });
    s = reduce(s, { type: 'tab/open', tab, activate: true });
    ids.push(tab.id);
  }
  return { s, ids };
}

describe('reducer: tabs', () => {
  it('opens a tab at the top of Today and activates it', () => {
    const { s, ids } = stateWithTabs(2);
    const space = s.spaces[s.activeSpaceId];
    expect(space?.today).toEqual([ids[1], ids[0]]);
    expect(space?.activeTabId).toBe(ids[1]);
    expect(s.mru).toEqual([ids[1], ids[0]]);
    expect(activeTab(s)?.id).toBe(ids[1]);
  });

  it('closing the active tab archives it and activates the MRU neighbour', () => {
    const { s, ids } = stateWithTabs(3);
    const next = reduce(s, { type: 'tab/close', id: ids[2] ?? '', now: NOW + 10 });
    expect(next.tabs[ids[2] ?? '']).toBeUndefined();
    expect(next.spaces[next.activeSpaceId]?.activeTabId).toBe(ids[1]);
    expect(next.archive[0]?.id).toBe(ids[2]);
    expect(next.archive[0]?.reason).toBe('closed');
    expect(next.mru).not.toContain(ids[2]);
  });

  it('is a no-op for unknown ids and returns the same reference', () => {
    const { s } = stateWithTabs(1);
    expect(reduce(s, { type: 'tab/activate', id: 'nope', now: NOW })).toBe(s);
    expect(reduce(s, { type: 'tab/close', id: 'nope', now: NOW })).toBe(s);
  });

  it('pins and unpins', () => {
    const { s, ids } = stateWithTabs(1);
    const pinned = reduce(s, { type: 'tab/pin', id: ids[0] ?? '' });
    const space = pinned.spaces[pinned.activeSpaceId];
    expect(space?.pinned).toEqual([ids[0]]);
    expect(space?.today).toEqual([]);
    expect(pinned.tabs[ids[0] ?? '']?.kind).toBe('pinned');
    expect(pinned.tabs[ids[0] ?? '']?.homeUrl).toBe('https://example.com/0');
    const unpinned = reduce(pinned, { type: 'tab/unpin', id: ids[0] ?? '', now: NOW + 5 });
    expect(unpinned.spaces[unpinned.activeSpaceId]?.today).toEqual([ids[0]]);
    expect(unpinned.tabs[ids[0] ?? '']?.homeUrl).toBeNull();
  });
});

describe('reducer: spaces', () => {
  it('cannot delete the last space', () => {
    const s = createDefaultState(NOW);
    expect(reduce(s, { type: 'space/delete', id: s.activeSpaceId, now: NOW })).toBe(s);
  });

  it('deleting a space archives its tabs and activates a neighbour', () => {
    const { s, ids } = stateWithTabs(2);
    const other = createSpace({ id: 'sp2', name: 'Work', now: NOW });
    let next = reduce(s, { type: 'space/create', space: other });
    next = reduce(next, { type: 'space/delete', id: s.activeSpaceId, now: NOW });
    expect(next.activeSpaceId).toBe('sp2');
    expect(Object.keys(next.tabs)).toHaveLength(0);
    expect(next.archive.map((a) => a.id).sort()).toEqual([...ids].sort());
  });
});

describe('selectors', () => {
  it('visibleTabIds returns split panes when a split is active', () => {
    const { s, ids } = stateWithTabs(2);
    const split = reduce(s, { type: 'split/add', spaceId: s.activeSpaceId, tabId: ids[0] ?? '' });
    expect(visibleTabIds(split)).toEqual([ids[1], ids[0]]);
  });
});
