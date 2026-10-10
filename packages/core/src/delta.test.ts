import { describe, expect, it } from 'vitest';
import { applyDelta, needsSnapshot } from './delta';
import { createDefaultState, createTab } from './factories';
import { reduce } from './reducer';

describe('state deltas', () => {
  it('replays actions through the reducer and keeps the archive empty', () => {
    const base = createDefaultState(0);
    const tab = createTab({ id: 't1', url: 'https://a.example', spaceId: base.activeSpaceId });
    const actions = [
      { type: 'tab/open' as const, tab, activate: true },
      { type: 'tab/update' as const, id: 't1', patch: { title: 'A' } },
      { type: 'tab/close' as const, id: 't1', now: 1, reason: 'closed' as const },
    ];
    const res = applyDelta(base, 0, { kind: 'actions', fromRev: 0, rev: 3, actions });
    if ('resync' in res) throw new Error('unexpected resync');
    expect(res.rev).toBe(3);
    expect(res.state.tabs.t1).toBeUndefined();
    expect(res.state.archive).toEqual([]);
    const main = actions.reduce((s, a) => reduce(s, a), base);
    expect({ ...res.state, archive: [] }).toEqual({ ...main, archive: [] });
  });

  it('asks for a resync when a message was missed', () => {
    const base = createDefaultState(0);
    expect(applyDelta(base, 2, { kind: 'actions', fromRev: 5, rev: 6, actions: [] })).toEqual({
      resync: true,
    });
  });

  it('snapshots replace everything', () => {
    const base = createDefaultState(0);
    const other = createDefaultState(1);
    const res = applyDelta(base, 9, { kind: 'snapshot', rev: 10, state: other });
    expect(res).toEqual({ state: other, rev: 10 });
  });

  it('archive-dependent actions need a snapshot', () => {
    expect(needsSnapshot({ type: 'archive/restore', id: 'x', newTabId: 'y', now: 0 })).toBe(true);
    expect(needsSnapshot({ type: 'state/replace', state: createDefaultState(0) })).toBe(true);
    expect(needsSnapshot({ type: 'tab/update', id: 'x', patch: {} })).toBe(false);
  });
});
