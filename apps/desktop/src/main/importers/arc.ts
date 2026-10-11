import {
  createFolder,
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
  const empty: ArcSidebar = { spaces: [], items: new Map(), favoriteContainerIds: [] };
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
  const favoriteContainerIds = Array.isArray(container.topAppsContainerIDs)
    ? container.topAppsContainerIDs.filter((v): v is string => typeof v === 'string' && items.has(v))
    : [];
  return { spaces, items, favoriteContainerIds };
}

export interface ArcImportCounts {
  spaces: number;
  pinned: number;
  today: number;
  folders: number;
  favorites: number;
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
): { state: CoreState; counts: ArcImportCounts } {
  let next = state;
  const counts: ArcImportCounts = { spaces: 0, pinned: 0, today: 0, folders: 0, favorites: 0 };
  const visited = new Set<string>();

  const childrenOf = (id: string | null): ArcItem[] => {
    if (!id || visited.has(id)) return [];
    visited.add(id);
    const item = sidebar.items.get(id);
    if (!item) return [];
    return item.children.map((c) => sidebar.items.get(c)).filter((c): c is ArcItem => c !== undefined);
  };

  const openTab = (item: ArcItem, spaceId: Id | null, kind: 'pinned' | 'today' | 'favorite'): Id => {
    const url = item.url ?? '';
    const tab = {
      ...createTab({ url, spaceId, kind, title: item.savedTitle ?? item.title ?? '', now }),
      createdAt: item.createdAt ?? now,
    };
    next = reduce(next, { type: 'tab/open', tab, activate: false, index: Number.MAX_SAFE_INTEGER });
    return tab.id;
  };

  sidebar.spaces.forEach((arc, i) => {
    const space = createSpace({
      name: arc.title || 'Space',
      ...(arc.emoji ? { emoji: arc.emoji } : {}),
      theme: arc.theme ?? SPACE_PRESET_THEMES[i % SPACE_PRESET_THEMES.length] ?? DEFAULT_THEME,
      now,
    });
    next = reduce(next, { type: 'space/create', space });
    counts.spaces++;
    const seen = new Set<string>();

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
          const f = createFolder({ spaceId: space.id, name: child.title?.trim() || 'Folder' });
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

  const favUrls = new Set(next.favorites.map((id) => next.tabs[id]?.url).filter((u): u is string => !!u));
  const walkFavorites = (parentArcId: string): void => {
    for (const child of childrenOf(parentArcId)) {
      if (child.kind === 'tab') {
        if (!child.url || !isWebUrl(child.url) || favUrls.has(child.url)) continue;
        favUrls.add(child.url);
        openTab(child, null, 'favorite');
        counts.favorites++;
      } else {
        walkFavorites(child.id);
      }
    }
  };
  for (const id of sidebar.favoriteContainerIds) walkFavorites(id);

  return { state: next, counts };
}
