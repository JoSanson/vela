import type { HistoryEntryIn } from './history';
import { folder, hasLeaves, leaf, type BookmarkFolder, type BookmarkNode } from './tree';

/** One `moz_bookmarks` row left-joined to its `moz_places` URL. */
export interface FirefoxBookmarkRow {
  id: number;
  type: number;
  parent: number;
  position: number;
  title: string | null;
  guid: string;
  url: string | null;
}

export const FIREFOX_BOOKMARKS_SQL = `
  SELECT b.id, b.type, b.parent, b.position, b.title, b.guid, p.url
  FROM moz_bookmarks b
  LEFT JOIN moz_places p ON p.id = b.fk
  ORDER BY b.parent, b.position`;

const TYPE_BOOKMARK = 1;
const TYPE_FOLDER = 2;

const ROOT_GUID = 'root________';
const ROOTS: Record<string, { title: string; emoji: string }> = {
  toolbar_____: { title: 'Bookmarks toolbar', emoji: '📑' },
  menu________: { title: 'Bookmarks menu', emoji: '📚' },
  unfiled_____: { title: 'Other bookmarks', emoji: '🗂️' },
  mobile______: { title: 'Mobile bookmarks', emoji: '📱' },
};

/** `moz_historyvisits.visit_date` and `moz_places.last_visit_date` are microseconds since the epoch. */
export function firefoxTimeToMs(micros: number): number {
  return Math.round(micros / 1000);
}

export function firefoxRowsToTree(rows: FirefoxBookmarkRow[]): BookmarkFolder[] {
  const byParent = new Map<number, FirefoxBookmarkRow[]>();
  for (const r of rows) {
    const list = byParent.get(r.parent) ?? [];
    list.push(r);
    byParent.set(r.parent, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.position - b.position);

  const convert = (parentId: number, depth: number): BookmarkNode[] => {
    const out: BookmarkNode[] = [];
    for (const r of byParent.get(parentId) ?? []) {
      if (r.type === TYPE_BOOKMARK && r.url) out.push(leaf(r.title ?? '', r.url));
      else if (r.type === TYPE_FOLDER && depth < 32)
        out.push(folder(r.title ?? 'Folder', convert(r.id, depth + 1)));
    }
    return out;
  };

  const root = rows.find((r) => r.guid === ROOT_GUID);
  if (!root) return [];
  const roots: BookmarkFolder[] = [];
  for (const top of byParent.get(root.id) ?? []) {
    // tags________ holds tag pseudo-folders that duplicate real bookmarks.
    if (top.type !== TYPE_FOLDER || top.guid === 'tags________') continue;
    const known = ROOTS[top.guid];
    const f = folder(known?.title ?? top.title ?? 'Bookmarks', convert(top.id, 1), known?.emoji);
    if (hasLeaves(f)) roots.push(f);
  }
  return roots;
}

export interface FirefoxHistoryRow {
  url: string;
  title: string | null;
  visit_count: number | null;
  last_visit: number | null;
}

export const FIREFOX_HISTORY_SQL = `
  SELECT p.url AS url, p.title AS title, p.visit_count AS visit_count, MAX(v.visit_date) AS last_visit
  FROM moz_places p
  JOIN moz_historyvisits v ON v.place_id = p.id
  WHERE p.hidden = 0
  GROUP BY p.id
  ORDER BY last_visit DESC
  LIMIT 20000`;

export function firefoxHistoryToEntries(rows: FirefoxHistoryRow[]): HistoryEntryIn[] {
  return rows
    .filter((r) => r.last_visit !== null)
    .map((r) => ({
      url: r.url,
      title: r.title ?? '',
      lastVisit: firefoxTimeToMs(r.last_visit ?? 0),
      visitCount: Math.max(1, r.visit_count ?? 1),
    }));
}
