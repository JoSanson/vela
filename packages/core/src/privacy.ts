import type { CoreState, Id } from './types';

/** A space whose profile is ephemeral keeps nothing: in-memory session, no history, no tabs after quit. */
export function isEphemeralSpace(state: CoreState, spaceId: Id | null | undefined): boolean {
  const space = spaceId ? state.spaces[spaceId] : undefined;
  const profile = space?.profileId ? state.profiles[space.profileId] : undefined;
  return profile?.ephemeral === true;
}

/** Removes every tab that lived in an ephemeral space (used at startup, so private tabs never come back). */
export function dropEphemeralTabs(state: CoreState): CoreState {
  const gone = new Set<Id>();
  for (const t of Object.values(state.tabs))
    if (t.spaceId && isEphemeralSpace(state, t.spaceId)) gone.add(t.id);
  if (gone.size === 0) return state;
  const tabs = { ...state.tabs };
  for (const id of gone) delete tabs[id];
  const spaces = { ...state.spaces };
  for (const sid of state.spaceOrder) {
    const s = spaces[sid];
    if (!s || !isEphemeralSpace(state, sid)) continue;
    spaces[sid] = {
      ...s,
      today: [],
      pinned: s.pinned.filter((id) => !gone.has(id)),
      activeTabId: null,
      split: null,
    };
  }
  const folders = { ...state.folders };
  for (const f of Object.values(folders)) {
    if (f.children.some((c) => gone.has(c)))
      folders[f.id] = { ...f, children: f.children.filter((c) => !gone.has(c)) };
  }
  return { ...state, tabs, spaces, folders, mru: state.mru.filter((id) => !gone.has(id)) };
}
