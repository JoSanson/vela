import { folder, leaf, type BookmarkFolder, type BookmarkNode } from './tree';

export interface ChromeBookmarkNode {
  type: 'url' | 'folder';
  name: string;
  url?: string;
  children?: ChromeBookmarkNode[];
}

export interface ChromeBookmarks {
  roots: Record<string, ChromeBookmarkNode | undefined>;
}

/** Chrome's WebKit timestamps are microseconds since 1601-01-01. */
export function chromeTimeToMs(t: number): number {
  return Math.round(t / 1000 - 11644473600000);
}

function convert(node: ChromeBookmarkNode): BookmarkNode[] {
  const out: BookmarkNode[] = [];
  for (const child of node.children ?? []) {
    if (child.type === 'url' && child.url) out.push(leaf(child.name, child.url));
    else if (child.type === 'folder') out.push(folder(child.name, convert(child)));
  }
  return out;
}

export function chromeBookmarksToTree(data: ChromeBookmarks): BookmarkFolder[] {
  const roots: BookmarkFolder[] = [];
  const bar = data.roots.bookmark_bar;
  const other = data.roots.other;
  if (bar) roots.push(folder('Bookmarks bar', convert(bar), '📑'));
  if (other?.children?.length) roots.push(folder('Other bookmarks', convert(other), '📚'));
  return roots;
}
