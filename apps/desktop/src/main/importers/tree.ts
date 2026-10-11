import { createFolder, createTab, reduce, type CoreState, type Id } from '@vela/core';

export interface BookmarkLeaf {
  kind: 'url';
  title: string;
  url: string;
}

export interface BookmarkFolder {
  kind: 'folder';
  title: string;
  emoji?: string;
  children: BookmarkNode[];
}

export type BookmarkNode = BookmarkLeaf | BookmarkFolder;

export const MAX_BOOKMARKS = 5000;
export const MAX_FOLDER_DEPTH = 6;

export function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function folder(title: string, children: BookmarkNode[], emoji?: string): BookmarkFolder {
  return { kind: 'folder', title, children, ...(emoji ? { emoji } : {}) };
}

export function leaf(title: string, url: string): BookmarkLeaf {
  return { kind: 'url', title, url };
}

/** Folders with no web bookmark anywhere underneath carry nothing worth recreating. */
export function hasLeaves(node: BookmarkNode): boolean {
  return node.kind === 'url' ? isWebUrl(node.url) : node.children.some(hasLeaves);
}

/**
 * Recreates a bookmark tree as pinned tabs and folders in `spaceId`, folding everything through the
 * pure reducer so the caller can commit the result once.
 */
export function applyBookmarkTree(
  state: CoreState,
  spaceId: Id,
  roots: BookmarkFolder[],
  now: number,
): { state: CoreState; count: number } {
  let next = state;
  let count = 0;
  const walk = (node: BookmarkFolder, parentFolderId: Id | null, depth: number): void => {
    for (const child of node.children) {
      if (child.kind === 'url') {
        if (!isWebUrl(child.url) || count >= MAX_BOOKMARKS) continue;
        const tab = createTab({ url: child.url, spaceId, kind: 'pinned', title: child.title, now });
        next = reduce(next, { type: 'tab/open', tab, activate: false });
        if (parentFolderId) {
          next = reduce(next, {
            type: 'tab/move',
            id: tab.id,
            to: { container: { kind: 'folder', folderId: parentFolderId }, index: Number.MAX_SAFE_INTEGER },
            now,
          });
        }
        count++;
      } else if (depth < MAX_FOLDER_DEPTH) {
        const f = createFolder({ spaceId, name: child.title || 'Folder', emoji: child.emoji ?? null });
        next = reduce(next, {
          type: 'folder/create',
          folder: f,
          ...(parentFolderId ? { parentFolderId } : {}),
        });
        walk(child, f.id, depth + 1);
      }
    }
  };
  for (const root of roots) {
    const top = createFolder({ spaceId, name: root.title, emoji: root.emoji ?? null });
    next = reduce(next, { type: 'folder/create', folder: top });
    walk(root, top.id, 1);
  }
  return { state: next, count };
}
