import type { ArchivedTab, CoreState, Folder, Id, Profile, Space, SpaceTheme, Tab, TabKind } from './types';

export function createId(): Id {
  return crypto.randomUUID();
}

export const DEFAULT_THEME: SpaceTheme = { from: '#5B6CFF', to: '#9A5BFF', grain: 0.08, mode: 'system' };

export const SPACE_PRESET_THEMES: readonly SpaceTheme[] = [
  { from: '#5B6CFF', to: '#9A5BFF', grain: 0.08, mode: 'system' },
  { from: '#FF7A59', to: '#FFB457', grain: 0.08, mode: 'system' },
  { from: '#1FB58B', to: '#5BE0B5', grain: 0.08, mode: 'system' },
  { from: '#F25C78', to: '#FF9FB3', grain: 0.08, mode: 'system' },
  { from: '#2F80ED', to: '#56CCF2', grain: 0.08, mode: 'system' },
  { from: '#3A3D4A', to: '#6B6F80', grain: 0.1, mode: 'dark' },
];

export interface SpaceInit {
  id?: Id;
  name: string;
  emoji?: string;
  theme?: SpaceTheme;
  profileId?: Id | null;
  now?: number;
}

export function createSpace(init: SpaceInit): Space {
  return {
    id: init.id ?? createId(),
    name: init.name,
    emoji: init.emoji ?? '✦',
    theme: init.theme ?? DEFAULT_THEME,
    profileId: init.profileId ?? null,
    pinned: [],
    today: [],
    activeTabId: null,
    split: null,
    createdAt: init.now ?? Date.now(),
  };
}

export interface TabInit {
  id?: Id;
  url: string;
  spaceId: Id | null;
  kind?: TabKind;
  title?: string;
  now?: number;
}

export function createTab(init: TabInit): Tab {
  const now = init.now ?? Date.now();
  const kind = init.kind ?? 'today';
  return {
    id: init.id ?? createId(),
    kind,
    spaceId: kind === 'favorite' ? null : init.spaceId,
    url: init.url,
    homeUrl: kind === 'today' ? null : init.url,
    title: init.title ?? '',
    customTitle: null,
    emoji: null,
    favicon: null,
    createdAt: now,
    lastActiveAt: now,
    loading: false,
    canGoBack: false,
    canGoForward: false,
    audible: false,
    muted: false,
    sleeping: false,
    alwaysActive: false,
    loaded: false,
    zoom: 1,
    scrollY: 0,
  };
}

export interface FolderInit {
  id?: Id;
  spaceId: Id;
  name: string;
  emoji?: string | null;
}

export function createFolder(init: FolderInit): Folder {
  return {
    id: init.id ?? createId(),
    spaceId: init.spaceId,
    name: init.name,
    emoji: init.emoji ?? null,
    children: [],
    collapsed: false,
  };
}

export function createProfile(name: string, color: string, id: Id = createId(), ephemeral = false): Profile {
  return {
    id,
    name,
    partition: ephemeral ? `private-${id}` : `persist:profile-${id}`,
    color,
    ...(ephemeral ? { ephemeral: true } : {}),
  };
}

export function toArchived(
  tab: Tab,
  spaceName: string,
  now: number,
  reason: ArchivedTab['reason'],
): ArchivedTab {
  return {
    id: tab.id,
    spaceId: tab.spaceId,
    spaceName,
    url: tab.url,
    title: tab.customTitle ?? tab.title,
    favicon: tab.favicon,
    archivedAt: now,
    reason,
  };
}

export function createDefaultState(now: number = Date.now()): CoreState {
  const space = createSpace({ name: 'Home', emoji: '🏠', now });
  return {
    spaces: { [space.id]: space },
    spaceOrder: [space.id],
    activeSpaceId: space.id,
    tabs: {},
    folders: {},
    favorites: [],
    mru: [],
    archive: [],
    atcRules: [],
    profiles: {},
  };
}
