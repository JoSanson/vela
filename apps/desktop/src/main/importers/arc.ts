import {
  createFolder,
  createProfile,
  createSpace,
  createTab,
  DEFAULT_THEME,
  reduce,
  SPACE_PRESET_THEMES,
  type CoreState,
  type Id,
  type SpaceTheme,
} from '@vela/core';
import { isWebUrl, MAX_BOOKMARKS, MAX_FOLDER_DEPTH } from './tree';

/*
 * StorableSidebar.json as written by Arc on macOS (Swift Codable output):
 *   sidebar.containers[]            one `{ global: {} }` entry plus one holding the real data
 *     .spaces[]                     alternating "<id>", { id, title, containerIDs, customInfo, profile }
 *     .items[]                      alternating "<id>", { id, parentID, childrenIds, title, createdAt, data }
 *     .topAppsContainerIDs[]        alternating { default: true } | { custom: {...} }, "<container id>"
 *   space.containerIDs              ["unpinned", "<id>", "pinned", "<id>"] (ids are not always UUIDs)
 *   item.data                       one of { tab }, { list }, { itemContainer }, { splitView }
 *   timestamps                      seconds since 2001-01-01
 */

interface ArcColor {
  red?: number;
  green?: number;
  blue?: number;
}

export interface ArcWindowTheme {
  primaryColorPalette?: {
    midTone?: ArcColor;
    shaded?: ArcColor;
    shadedDark?: ArcColor;
    tintedLight?: ArcColor;
  };
  background?: {
    single?: {
      _0?: {
        style?: {
          color?: {
            _0?: { blendedSingleColor?: { _0?: { color?: ArcColor; modifiers?: { noiseFactor?: number } } } };
          };
        };
      };
    };
  };
}

export interface ArcIconType {
  emoji?: number;
  emoji_v2?: string;
  icon?: string;
}

export interface ArcSpace {
  id: string;
  title: string;
  emoji: string | null;
  theme: SpaceTheme | null;
  pinnedId: string | null;
  unpinnedId: string | null;
  /** 'default' or the Chromium profile directory (`Profile 3`); favorites are per profile in Arc. */
  profile: string;
}

export type ArcItemKind = 'tab' | 'list' | 'container' | 'split' | 'unknown';

export interface ArcItem {
  id: string;
  parentId: string | null;
  children: string[];
  title: string | null;
  createdAt: number | null;
  kind: ArcItemKind;
  url: string | null;
  savedTitle: string | null;
}

export interface ArcSidebar {
  spaces: ArcSpace[];
  items: Map<string, ArcItem>;
  favoriteContainerIds: string[];
  /** Top-apps containers with the profile each one belongs to, in file order. */
  favoriteContainers: { profile: string; id: string }[];
}

/** `{ default: true }` → 'default'; `{ custom: { _0: { directoryBasename } } }` → that directory. */
export function arcProfileKey(raw: unknown): string {
  if (!isObj(raw)) return 'default';
  if (raw.default) return 'default';
  const custom = isObj(raw.custom) ? raw.custom : null;
  const inner = custom && isObj(custom._0) ? custom._0 : custom;
  const dir = inner ? strOrNull(inner.directoryBasename) : null;
  return dir ?? 'default';
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function objects(v: unknown): Obj[] {
  return Array.isArray(v) ? v.filter(isObj) : [];
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function arcTimeToMs(seconds: number): number {
  return Math.round(seconds * 1000 + 978307200000);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function toRgb(c: ArcColor | undefined): [number, number, number] | null {
  if (!c || typeof c.red !== 'number' || typeof c.green !== 'number' || typeof c.blue !== 'number')
    return null;
  // Arc stores extended sRGB: components can exceed [0, 1].
  return [clamp01(c.red), clamp01(c.green), clamp01(c.blue)];
}

function hex([r, g, b]: [number, number, number]): string {
  const h = (n: number): string =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function arcThemeToSpaceTheme(theme: ArcWindowTheme | undefined): SpaceTheme | null {
  const palette = theme?.primaryColorPalette;
  const blended = theme?.background?.single?._0?.style?.color?._0?.blendedSingleColor?._0;
  const from = toRgb(palette?.midTone) ?? toRgb(palette?.shaded) ?? toRgb(blended?.color);
  if (!from) return null;
  const light = toRgb(palette?.tintedLight) ?? [1, 1, 1];
  const grain = (blended?.modifiers?.noiseFactor ?? 0) > 0 ? 0.12 : 0.08;
  return { from: hex(from), to: hex(mix(from, light, 0.55)), grain, mode: 'system' };
}

export function arcEmoji(iconType: ArcIconType | undefined): string | null {
  if (!iconType) return null;
  if (typeof iconType.emoji_v2 === 'string' && iconType.emoji_v2.trim()) return iconType.emoji_v2.trim();
  if (typeof iconType.emoji === 'number' && iconType.emoji > 0) {
    try {
      return String.fromCodePoint(iconType.emoji);
    } catch {
      return null;
    }
  }
  return null;
}

/** `["unpinned", "<id>", "pinned", "<id>"]`, or the newer `[{ pinned: {} }, "<id>", ...]` form. */
function containerPair(list: unknown): { pinned: string | null; unpinned: string | null } {
  const out = { pinned: null as string | null, unpinned: null as string | null };
  if (!Array.isArray(list)) return out;
  for (let i = 0; i + 1 < list.length; i++) {
    const marker: unknown = list[i];
    const key = typeof marker === 'string' ? marker : isObj(marker) ? Object.keys(marker)[0] : undefined;
    const id: unknown = list[i + 1];
    if (typeof id !== 'string') continue;
    if (key === 'pinned' && !out.pinned) out.pinned = id;
    else if (key === 'unpinned' && !out.unpinned) out.unpinned = id;
  }
  return out;
}

function parseSpace(raw: Obj): ArcSpace | null {
  const id = strOrNull(raw.id);
  if (!id) return null;
  const custom = isObj(raw.customInfo) ? raw.customInfo : {};
  const ids = containerPair(raw.containerIDs);
  const newer = containerPair(raw.newContainerIDs);
  return {
    id,
    title: strOrNull(raw.title)?.trim() ?? '',
    emoji: arcEmoji(isObj(custom.iconType) ? custom.iconType : undefined),
    theme: arcThemeToSpaceTheme(isObj(custom.windowTheme) ? custom.windowTheme : undefined),
    pinnedId: ids.pinned ?? newer.pinned,
    unpinnedId: ids.unpinned ?? newer.unpinned,
    profile: arcProfileKey(raw.profile),
  };
}

function parseItem(raw: Obj): ArcItem | null {
  const id = strOrNull(raw.id);
  if (!id) return null;
  const data = isObj(raw.data) ? raw.data : {};
  const tab = isObj(data.tab) ? data.tab : null;
  const kind: ArcItemKind = tab
    ? 'tab'
    : 'list' in data
      ? 'list'
      : 'itemContainer' in data
        ? 'container'
        : 'splitView' in data
          ? 'split'
          : 'unknown';
  const createdAt = numOrNull(raw.createdAt);
  return {
    id,
    parentId: strOrNull(raw.parentID),
    children: Array.isArray(raw.childrenIds)
      ? raw.childrenIds.filter((c): c is string => typeof c === 'string')
      : [],
    title: strOrNull(raw.title),
    createdAt: createdAt === null ? null : arcTimeToMs(createdAt),
    kind,
    url: tab ? strOrNull(tab.savedURL) : null,
    savedTitle: tab ? strOrNull(tab.savedTitle) : null,
  };
}

export function parseArcSidebar(json: unknown): ArcSidebar {
  const empty: ArcSidebar = {
    spaces: [],
    items: new Map(),
    favoriteContainerIds: [],
    favoriteContainers: [],
  };
  if (!isObj(json) || !isObj(json.sidebar)) return empty;
  const container = objects(json.sidebar.containers).find((c) => Array.isArray(c.spaces));
  if (!container) return empty;
  const items = new Map<string, ArcItem>();
  for (const raw of objects(container.items)) {
    const item = parseItem(raw);
    if (item) items.set(item.id, item);
  }
  const spaces = objects(container.spaces)
    .map(parseSpace)
    .filter((s): s is ArcSpace => s !== null);
  const favoriteContainers: { profile: string; id: string }[] = [];
  const markers = Array.isArray(container.topAppsContainerIDs) ? container.topAppsContainerIDs : [];
  let profile = 'default';
  for (const entry of markers) {
    if (typeof entry === 'string') {
      if (items.has(entry)) favoriteContainers.push({ profile, id: entry });
      profile = 'default';
    } else {
      profile = arcProfileKey(entry);
    }
  }
  return { spaces, items, favoriteContainerIds: favoriteContainers.map((c) => c.id), favoriteContainers };
}

export interface ArcImportCounts {
  spaces: number;
  pinned: number;
  today: number;
  folders: number;
  favorites: number;
  profiles: number;
}

const PROFILE_COLORS = [
  '#6366f1',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#0ea5e9',
  '#8b5cf6',
  '#ef4444',
  '#14b8a6',
];

/** Arc profile directory → Vela profile id (null = the default profile), reusing profiles by name. */
export function mapArcProfiles(
  state: CoreState,
  sidebar: ArcSidebar,
  names: Record<string, string>,
): { state: CoreState; byDir: Record<string, Id | null>; created: number } {
  let next = state;
  const byDir: Record<string, Id | null> = { default: null, Default: null };
  let created = 0;
  const dirs = [...new Set(sidebar.spaces.map((s) => s.profile))].filter((d) => d !== 'default');
  for (const dir of dirs) {
    const name = names[dir] ?? dir;
    const existing = Object.values(next.profiles).find((p) => p.name === name && !p.ephemeral);
    if (existing) {
      byDir[dir] = existing.id;
      continue;
    }
    const profile = createProfile(name, PROFILE_COLORS[created % PROFILE_COLORS.length] ?? '#6366f1');
    next = reduce(next, { type: 'profile/create', profile });
    byDir[dir] = profile.id;
    created++;
  }
  return { state: next, byDir, created };
}

/**
 * Recreates the Arc sidebar in Vela: one Space per Arc space (name, emoji, theme), the pinned
 * container as pinned tabs and nested folders in order, the unpinned container as today tabs, and
 * every top-apps container as favorites. URLs are deduplicated within a space and across favorites;
 * split views are flattened into their parent. The caller commits the returned state once.
 */
export function applyArcSidebar(
  state: CoreState,
  sidebar: ArcSidebar,
  now: number,
  profileNames: Record<string, string> = {},
): { state: CoreState; counts: ArcImportCounts; profiles: Record<string, Id | null> } {
  const mapped = mapArcProfiles(state, sidebar, profileNames);
  let next = mapped.state;
  const counts: ArcImportCounts = {
    spaces: 0,
    pinned: 0,
    today: 0,
    folders: 0,
    favorites: 0,
    profiles: mapped.created,
  };
  const visited = new Set<string>();

  const childrenOf = (id: string | null): ArcItem[] => {
    if (!id || visited.has(id)) return [];
    visited.add(id);
    const item = sidebar.items.get(id);
    if (!item) return [];
    return item.children.map((c) => sidebar.items.get(c)).filter((c): c is ArcItem => c !== undefined);
  };

  const openTab = (
    item: ArcItem,
    spaceId: Id | null,
    kind: 'pinned' | 'today' | 'favorite',
    profileId: Id | null = null,
  ): Id => {
    const url = item.url ?? '';
    const tab = {
      ...createTab({ url, spaceId, kind, profileId, title: item.savedTitle ?? item.title ?? '', now }),
      createdAt: item.createdAt ?? now,
    };
    next = reduce(next, { type: 'tab/open', tab, activate: false, index: Number.MAX_SAFE_INTEGER });
    return tab.id;
  };

  sidebar.spaces.forEach((arc, i) => {
    const name = arc.title || 'Space';
    const emoji = arc.emoji ?? null;
    const profileId = mapped.byDir[arc.profile] ?? null;
    // Importing again (to add profiles, cookies…) must not duplicate spaces: reuse by name + emoji.
    const existing = Object.values(next.spaces).find(
      (s) => s.name === name && (emoji === null || s.emoji === emoji),
    );
    const space =
      existing ??
      createSpace({
        name,
        ...(arc.emoji ? { emoji: arc.emoji } : {}),
        theme: arc.theme ?? SPACE_PRESET_THEMES[i % SPACE_PRESET_THEMES.length] ?? DEFAULT_THEME,
        profileId,
        now,
      });
    if (existing) {
      if (!existing.profileId && profileId) {
        next = reduce(next, { type: 'space/update', id: existing.id, patch: { profileId } });
      }
    } else {
      next = reduce(next, { type: 'space/create', space });
      counts.spaces++;
    }
    const seen = new Set<string>(
      Object.values(next.tabs)
        .filter((t) => t.spaceId === space.id)
        .map((t) => t.url),
    );

    const walkPinned = (parentArcId: string, parentFolderId: Id | null, depth: number): void => {
      for (const child of childrenOf(parentArcId)) {
        if (child.kind === 'tab') {
          if (!child.url || !isWebUrl(child.url) || seen.has(child.url) || counts.pinned >= MAX_BOOKMARKS)
            continue;
          seen.add(child.url);
          const tabId = openTab(child, space.id, 'pinned');
          if (parentFolderId) {
            next = reduce(next, {
              type: 'tab/move',
              id: tabId,
              to: { container: { kind: 'folder', folderId: parentFolderId }, index: Number.MAX_SAFE_INTEGER },
              now,
            });
          }
          counts.pinned++;
        } else if (child.kind === 'list' && depth < MAX_FOLDER_DEPTH) {
          const name = child.title?.trim() || 'Folder';
          // Importing again fills the folder of the same name at the same place, never a twin.
          const siblings = parentFolderId
            ? (next.folders[parentFolderId]?.children ?? [])
            : (next.spaces[space.id]?.pinned ?? []);
          const existingFolder = siblings.map((id) => next.folders[id]).find((f) => f?.name === name);
          if (existingFolder) {
            walkPinned(child.id, existingFolder.id, depth + 1);
            continue;
          }
          const f = createFolder({ spaceId: space.id, name });
          next = reduce(next, {
            type: 'folder/create',
            folder: f,
            ...(parentFolderId ? { parentFolderId } : {}),
          });
          counts.folders++;
          walkPinned(child.id, f.id, depth + 1);
        } else {
          walkPinned(child.id, parentFolderId, depth);
        }
      }
    };

    const walkToday = (parentArcId: string): void => {
      for (const child of childrenOf(parentArcId)) {
        if (child.kind === 'tab') {
          if (!child.url || !isWebUrl(child.url) || seen.has(child.url)) continue;
          seen.add(child.url);
          openTab(child, space.id, 'today');
          counts.today++;
        } else {
          walkToday(child.id);
        }
      }
    };

    if (arc.pinnedId) walkPinned(arc.pinnedId, null, 1);
    if (arc.unpinnedId) walkToday(arc.unpinnedId);
  });

  // Favorites belong to a profile in Arc and in Vela: each top-apps container lands in the Vela
  // profile its Arc profile maps to. Favorites an earlier import left without a profile are
  // claimed by the first profile whose container lists their URL instead of being duplicated.
  const favKey = (profileId: Id | null, url: string): string => `${profileId ?? ''}\n${url}`;
  const favByKey = new Map<string, Id>();
  // Only favorites from an earlier import can be claimed, and never ones Arc's default profile still
  // lists: the same site can be a favorite in two profiles, as two favorites.
  const earlier = new Set(next.favorites);
  const defaultUrls = new Set<string>();
  const collected = new Set<string>();
  const collectUrls = (arcId: string): void => {
    const item = sidebar.items.get(arcId);
    if (!item || collected.has(arcId)) return;
    collected.add(arcId);
    if (item.kind === 'tab' && item.url) defaultUrls.add(item.url);
    for (const c of item.children) collectUrls(c);
  };
  for (const c of sidebar.favoriteContainers) if (!mapped.byDir[c.profile]) collectUrls(c.id);
  for (const id of next.favorites) {
    const t = next.tabs[id];
    if (t) favByKey.set(favKey(t.profileId ?? null, t.url), id);
  }
  const walkFavorites = (parentArcId: string, profileId: Id | null): void => {
    for (const child of childrenOf(parentArcId)) {
      if (child.kind !== 'tab') {
        walkFavorites(child.id, profileId);
        continue;
      }
      if (!child.url || !isWebUrl(child.url) || favByKey.has(favKey(profileId, child.url))) continue;
      const legacy = profileId ? favByKey.get(favKey(null, child.url)) : undefined;
      if (legacy && earlier.has(legacy) && !defaultUrls.has(child.url)) {
        next = reduce(next, { type: 'tab/update', id: legacy, patch: { profileId } });
        favByKey.delete(favKey(null, child.url));
        favByKey.set(favKey(profileId, child.url), legacy);
        continue;
      }
      favByKey.set(favKey(profileId, child.url), openTab(child, null, 'favorite', profileId));
      counts.favorites++;
    }
  };
  for (const c of sidebar.favoriteContainers) walkFavorites(c.id, mapped.byDir[c.profile] ?? null);

  return { state: next, counts, profiles: mapped.byDir };
}
