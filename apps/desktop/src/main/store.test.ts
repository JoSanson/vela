import { createDefaultState, createTab, reduce, type CoreAction } from '@vela/core';
import { describe, expect, it } from 'vitest';
import { Store } from './store';

const NOW = 1_700_000_000_000;

describe('Store', () => {
  it('reports applied actions in reduction order, even when a listener dispatches', () => {
    const store = new Store(createDefaultState(NOW));
    const space = store.state.activeSpaceId;
    const a = createTab({ url: 'https://a.example/', spaceId: space, now: NOW });
    const b = createTab({ url: 'https://b.example/', spaceId: space, now: NOW });
    store.dispatch({ type: 'tab/open', tab: a, activate: true });
    store.dispatch({ type: 'tab/open', tab: b, activate: false });

    const before = store.state;
    const applied: CoreAction[] = [];
    store.onApplied((_next, action) => applied.push(action));
    // A listener reacting to the split by activating its new pane, as TabManager does.
    store.subscribe((_next, _prev, action) => {
      if (action.type === 'split/add') store.dispatch({ type: 'tab/activate', id: b.id, now: NOW + 1 });
    });
    store.dispatch({ type: 'split/add', spaceId: space, tabId: b.id });

    expect(applied.map((x) => x.type)).toEqual(['split/add', 'tab/activate']);
    // Renderers replay what they are sent: in this order they end up exactly where main is.
    expect(applied.reduce(reduce, before)).toEqual(store.state);
    expect(store.state.spaces[space]?.split?.panes).toEqual([a.id, b.id]);
  });

  it('does not report a no-op action', () => {
    const store = new Store(createDefaultState(NOW));
    const applied: string[] = [];
    store.onApplied((_next, action) => applied.push(action.type));
    store.dispatch({ type: 'tab/activate', id: 'missing', now: NOW });
    expect(applied).toEqual([]);
  });
});
