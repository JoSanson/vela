import type { HistoryEntryIn } from './history';
import type { PlistValue } from './plist';
import { folder, hasLeaves, leaf, type BookmarkFolder, type BookmarkNode } from './tree';

/** One node of ~/Library/Safari/Bookmarks.plist once decoded. */
export interface SafariPlistNode {
  WebBookmarkType?: string;
  Title?: string;
  URLString?: string;
  URIDictionary?: { title?: string };
  Children?: SafariPlistNode[];
}

/** Apple reference dates count seconds since 2001-01-01. */
export function appleTimeToMs(seconds: number): number {
  return Math.round(seconds * 1000 + 978307200000);
}

const TOP_LEVEL: Record<string, { title: string; emoji: string }> = {
  BookmarksBar: { title: 'Favorites bar', emoji: '📑' },
  BookmarksMenu: { title: 'Bookmarks menu', emoji: '📚' },
  'com.apple.ReadingList': { title: 'Reading List', emoji: '📖' },
};

function str(v: PlistValue | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Narrows a decoded plist value to the few bookmark fields we read; anything else is dropped. */
export function toSafariNode(v: PlistValue): SafariPlistNode | null {
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  const uri = v.URIDictionary;
  const uriTitle = uri && typeof uri === 'object' && !Array.isArray(uri) ? str(uri.title) : undefined;
  const children = Array.isArray(v.Children) ? v.Children : [];
  const node: SafariPlistNode = {
    Children: children.map(toSafariNode).filter((n): n is SafariPlistNode => n !== null),
  };
  const type = str(v.WebBookmarkType);
  const title = str(v.Title);
  const url = str(v.URLString);
  if (type !== undefined) node.WebBookmarkType = type;
  if (title !== undefined) node.Title = title;
  if (url !== undefined) node.URLString = url;
  if (uriTitle !== undefined) node.URIDictionary = { title: uriTitle };
  return node;
}

function convert(node: SafariPlistNode): BookmarkNode[] {
  const out: BookmarkNode[] = [];
  for (const child of node.Children ?? []) {
    if (child.WebBookmarkType === 'WebBookmarkTypeLeaf' && child.URLString) {
      out.push(leaf(child.URIDictionary?.title ?? child.Title ?? '', child.URLString));
    } else if (child.WebBookmarkType === 'WebBookmarkTypeList') {
      out.push(folder(child.Title ?? 'Folder', convert(child)));
    }
  }
  return out;
}

/** Top-level Safari lists become root folders; stray top-level leaves land in "Bookmarks". */
export function safariBookmarksToTree(root: SafariPlistNode): BookmarkFolder[] {
  const roots: BookmarkFolder[] = [];
  const loose: BookmarkNode[] = [];
  for (const child of root.Children ?? []) {
    if (child.WebBookmarkType === 'WebBookmarkTypeList') {
      const known = child.Title ? TOP_LEVEL[child.Title] : undefined;
      const f = folder(known?.title ?? child.Title ?? 'Folder', convert(child), known?.emoji);
      if (hasLeaves(f)) roots.push(f);
    } else if (child.WebBookmarkType === 'WebBookmarkTypeLeaf' && child.URLString) {
      loose.push(leaf(child.URIDictionary?.title ?? child.Title ?? '', child.URLString));
    }
  }
  if (loose.length) roots.push(folder('Bookmarks', loose, '📚'));
  return roots;
}

export interface SafariHistoryRow {
  url: string;
  title: string | null;
  visit_count: number | null;
  last_visit: number | null;
}

export const SAFARI_HISTORY_SQL = `
  SELECT i.url AS url,
         i.visit_count AS visit_count,
         MAX(v.visit_time) AS last_visit,
         (SELECT title FROM history_visits
            WHERE history_item = i.id AND title IS NOT NULL AND title != ''
            ORDER BY visit_time DESC LIMIT 1) AS title
  FROM history_items i
  LEFT JOIN history_visits v ON v.history_item = i.id
  GROUP BY i.id
  ORDER BY last_visit DESC
  LIMIT 20000`;

export function safariHistoryToEntries(rows: SafariHistoryRow[]): HistoryEntryIn[] {
  return rows
    .filter((r) => r.last_visit !== null)
    .map((r) => ({
      url: r.url,
      title: r.title ?? '',
      lastVisit: appleTimeToMs(r.last_visit ?? 0),
      visitCount: Math.max(1, r.visit_count ?? 1),
    }));
}
