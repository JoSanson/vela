import type { CoreState, Folder, Id, Space, Tab } from './types';

export function activeSpace(state: CoreState): Space | undefined {
  return state.spaces[state.activeSpaceId];
}

export function activeTab(state: CoreState): Tab | undefined {
  const space = activeSpace(state);
  return space?.activeTabId ? state.tabs[space.activeTabId] : undefined;
}

/** The Space whose pinned tabs, folders and look a (possibly per-window instance) Space shows. */
export function rootSpaceId(state: CoreState, spaceId: Id): Id {
  return state.spaces[spaceId]?.parentId ?? spaceId;
}

/** The sidebar item a Space's active tab stands for (a shadow stands for its favorite or pinned tab). */
export function activeItemId(state: CoreState, spaceId: Id = state.activeSpaceId): Id | null {
  const id = state.spaces[spaceId]?.activeTabId ?? null;
  return (id && state.tabs[id]?.shadowOf) || id;
}

/** Tabs that must have live contents right now: the active tab or split panes of the active space. */
export function visibleTabIds(state: CoreState, spaceId: Id = state.activeSpaceId): Id[] {
  const space = state.spaces[spaceId];
  if (!space) return [];
  if (space.split) return [...space.split.panes];
  return space.activeTabId ? [space.activeTabId] : [];
}

export type SidebarItem =
  { kind: 'tab'; tab: Tab; depth: number } | { kind: 'folder'; folder: Folder; depth: number };

/** Flattened pinned tree of a space, respecting collapsed folders. */
export function pinnedTree(state: CoreState, spaceId: Id, includeCollapsed = false): SidebarItem[] {
  const space = state.spaces[rootSpaceId(state, spaceId)];
  if (!space) return [];
  const out: SidebarItem[] = [];
  const walk = (ids: readonly Id[], depth: number): void => {
    for (const id of ids) {
      const folder = state.folders[id];
      if (folder) {
        out.push({ kind: 'folder', folder, depth });
        if (!folder.collapsed || includeCollapsed) walk(folder.children, depth + 1);
        continue;
      }
      const tab = state.tabs[id];
      if (tab) out.push({ kind: 'tab', tab, depth });
    }
  };
  walk(space.pinned, 0);
  return out;
}

export function spaceTabs(state: CoreState, spaceId: Id): Tab[] {
  return Object.values(state.tabs).filter((t) => t.spaceId === spaceId);
}

export function todayTabs(state: CoreState, spaceId: Id): Tab[] {
  const space = state.spaces[spaceId];
  if (!space) return [];
  return space.today.map((id) => state.tabs[id]).filter((t): t is Tab => t !== undefined);
}

/** The favorites a Space shows: those of its profile (favorites belong to profiles, as in Arc). */
export function favoriteTabs(state: CoreState, spaceId: Id = state.activeSpaceId): Tab[] {
  const profileId = state.spaces[spaceId]?.profileId ?? null;
  return state.favorites
    .map((id) => state.tabs[id])
    .filter((t): t is Tab => t !== undefined && (t.profileId ?? null) === profileId);
}

export function displayTitle(tab: Pick<Tab, 'customTitle' | 'title' | 'url'>): string {
  if (tab.customTitle) return tab.customTitle;
  if (tab.title) return tab.title;
  try {
    const u = new URL(tab.url);
    return u.hostname.replace(/^www\./, '') || tab.url;
  } catch {
    return tab.url || 'New tab';
  }
}

/** MRU-ordered tabs for the switcher; current space first, then others. */
export function mruTabs(state: CoreState, limit = 12): Tab[] {
  const out: Tab[] = [];
  for (const id of state.mru) {
    const t = state.tabs[id];
    if (t) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

export function folderPath(state: CoreState, folderId: Id): Folder[] {
  const path: Folder[] = [];
  let current: Folder | undefined = state.folders[folderId];
  const seen = new Set<Id>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    const parentId: Id | undefined = Object.values(state.folders).find((f) =>
      f.children.includes(current?.id ?? ''),
    )?.id;
    current = parentId ? state.folders[parentId] : undefined;
  }
  return path;
}

export function tabCount(state: CoreState): number {
  return Object.keys(state.tabs).length;
}

/** Tab to show in `spaceId` if `excludeId` goes away (MRU first, then list neighbours). */
export function pickNextActive(state: CoreState, spaceId: Id, excludeId: Id): Id | null {
  const space = state.spaces[spaceId];
  if (!space) return null;
  for (const id of state.mru) {
    if (id === excludeId) continue;
    const t = state.tabs[id];
    if (t?.spaceId === spaceId) return id;
  }
  const list = [
    ...space.today,
    ...pinnedTree(state, spaceId, true)
      .filter((i) => i.kind === 'tab')
      .map((i) => (i.kind === 'tab' ? i.tab.id : '')),
  ];
  const idx = list.indexOf(excludeId);
  const ordered = idx >= 0 ? [...list.slice(idx + 1), ...list.slice(0, idx).reverse()] : list;
  return ordered.find((id) => id && id !== excludeId) ?? null;
}
