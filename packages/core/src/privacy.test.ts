import { describe, expect, it } from 'vitest';
import { createDefaultState, createProfile, createSpace, createTab } from './factories';
import { dropEphemeralTabs, isEphemeralSpace } from './privacy';
import { reduce } from './reducer';

function stateWithPrivateSpace() {
  let state = createDefaultState(0);
  const profile = createProfile('Private', '#000', 'p-priv', true);
  state = reduce(state, { type: 'profile/create', profile });
  const space = createSpace({ id: 's-priv', name: 'Private', profileId: profile.id });
  state = reduce(state, { type: 'space/create', space });
  const secret = createTab({ id: 't-secret', url: 'https://secret.example', spaceId: space.id });
  state = reduce(state, { type: 'tab/open', tab: secret, activate: true });
  const open = createTab({ id: 't-open', url: 'https://open.example', spaceId: state.spaceOrder[0] ?? '' });
  state = reduce(state, { type: 'tab/open', tab: open, activate: false });
  return { state, space, secret, open };
}

describe('ephemeral profiles', () => {
  it('createProfile builds an in-memory partition for ephemeral profiles', () => {
    expect(createProfile('P', '#000', 'x', true).partition).toBe('private-x');
    expect(createProfile('P', '#000', 'x').partition).toBe('persist:profile-x');
  });

  it('isEphemeralSpace follows the space → profile link', () => {
    const { state, space } = stateWithPrivateSpace();
    expect(isEphemeralSpace(state, space.id)).toBe(true);
    expect(isEphemeralSpace(state, state.spaceOrder[0])).toBe(false);
    expect(isEphemeralSpace(state, 'nope')).toBe(false);
  });

  it('dropEphemeralTabs removes private tabs and leaves the rest untouched', () => {
    const { state, space, secret, open } = stateWithPrivateSpace();
    const next = dropEphemeralTabs(state);
    expect(next.tabs[secret.id]).toBeUndefined();
    expect(next.tabs[open.id]).toBeDefined();
    expect(next.spaces[space.id]?.today).toEqual([]);
    expect(next.spaces[space.id]?.activeTabId).toBeNull();
    expect(next.mru).not.toContain(secret.id);
    expect(dropEphemeralTabs(next)).toBe(next);
  });
});
