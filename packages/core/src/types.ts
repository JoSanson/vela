export type Id = string;

export type ThemeMode = 'light' | 'dark' | 'system';

export interface SpaceTheme {
  from: string;
  to: string;
  grain: number;
  mode: ThemeMode;
}

export interface Space {
  id: Id;
  name: string;
  emoji: string;
  theme: SpaceTheme;
  profileId: Id | null;
  /** Root-level pinned items: tab ids (kind 'pinned') or folder ids, in display order. */
  pinned: Id[];
  /** Ephemeral tabs, in display order. */
  today: Id[];
  activeTabId: Id | null;
  split: SplitLayout | null;
  createdAt: number;
}

export interface Folder {
  id: Id;
  spaceId: Id;
  name: string;
  emoji: string | null;
  /** Child items: tab ids or nested folder ids. */
  children: Id[];
  collapsed: boolean;
}

export type TabKind = 'favorite' | 'pinned' | 'today';

export interface Tab {
  id: Id;
  kind: TabKind;
  /** null for favorites, which belong to a profile instead of a Space. */
  spaceId: Id | null;
  /**
   * Favorites only (Arc semantics): the profile they belong to; every Space using that profile
   * shows them and they browse with its session. null = the default profile, and for other tabs.
   */
  profileId?: Id | null;
  url: string;
  /** Pinned & favorites: the URL they return to. */
  homeUrl: string | null;
  title: string;
  customTitle: string | null;
  emoji: string | null;
  favicon: string | null;
  createdAt: number;
  lastActiveAt: number;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  audible: boolean;
  muted: boolean;
  /** WebContents destroyed by memory saver; url/title/favicon kept. */
  sleeping: boolean;
  /** Never put to sleep. */
  alwaysActive: boolean;
  /** A live WebContents exists (false after lazy restore until first activation). */
  loaded: boolean;
  zoom: number;
  scrollY: number;
  /** The current page loaded only because the user bypassed a certificate error. */
  certWarning?: boolean;
}

export interface SplitLayout {
  /** 2–4 tab ids, left to right. */
  panes: Id[];
  /** Fractions summing to 1, same length as panes. */
  sizes: number[];
}

export type ArchiveReason = 'auto' | 'manual' | 'closed';

export interface ArchivedTab {
  id: Id;
  spaceId: Id | null;
  spaceName: string;
  url: string;
  title: string;
  favicon: string | null;
  archivedAt: number;
  reason: ArchiveReason;
}

export interface AtcRule {
  id: Id;
  /** Glob-ish pattern: `*.github.com/*`, `https://mail.google.com/*`, `notion.so`. */
  pattern: string;
  spaceId: Id;
  enabled: boolean;
}

export interface Profile {
  id: Id;
  name: string;
  /** Electron session partition: `persist:profile-<id>`, or `private-<id>` (in memory) when ephemeral. */
  partition: string;
  color: string;
  /** Private browsing: nothing is written to disk and its tabs are dropped at the next start. */
  ephemeral?: boolean;
}

export interface CoreState {
  spaces: Record<Id, Space>;
  spaceOrder: Id[];
  activeSpaceId: Id;
  tabs: Record<Id, Tab>;
  folders: Record<Id, Folder>;
  /** Global favorite tab ids, in grid order. */
  favorites: Id[];
  /** Tab ids, most recently active first (all spaces). */
  mru: Id[];
  /** Newest first. */
  archive: ArchivedTab[];
  atcRules: AtcRule[];
  profiles: Record<Id, Profile>;
}

export type Container =
  | { kind: 'today'; spaceId: Id }
  | { kind: 'pinned'; spaceId: Id }
  | { kind: 'folder'; folderId: Id }
  | { kind: 'favorites' };

export interface MoveTarget {
  container: Container;
  index: number;
}
