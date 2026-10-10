import { createFolder, createTab, type Id } from '@vela/core';
import type { BrowserImportSource, ImportResult } from '@vela/shared';
import Database from 'better-sqlite3';
import { app } from 'electron';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppContext } from './context';

interface ChromeBookmarkNode {
  type: 'url' | 'folder';
  name: string;
  url?: string;
  children?: ChromeBookmarkNode[];
}

interface ChromeBookmarks {
  roots: Record<string, ChromeBookmarkNode>;
}

function profileDirs(source: BrowserImportSource['id']): string[] {
  const home = app.getPath('home');
  const mac: Record<string, string> = {
    chrome: 'Library/Application Support/Google/Chrome',
    brave: 'Library/Application Support/BraveSoftware/Brave-Browser',
    edge: 'Library/Application Support/Microsoft Edge',
  };
  const win: Record<string, string> = {
    chrome: 'AppData/Local/Google/Chrome/User Data',
    brave: 'AppData/Local/BraveSoftware/Brave-Browser/User Data',
    edge: 'AppData/Local/Microsoft/Edge/User Data',
  };
  const linux: Record<string, string> = {
    chrome: '.config/google-chrome',
    brave: '.config/BraveSoftware/Brave-Browser',
    edge: '.config/microsoft-edge',
  };
  const base =
    process.platform === 'darwin' ? mac[source] : process.platform === 'win32' ? win[source] : linux[source];
  if (!base) return [];
  // Tests point this at a synthetic profile tree (<root>/<source>/Default).
  const override = process.env.VELA_IMPORT_ROOT;
  const root = override ? join(override, source) : join(home, base);
  return ['Default', 'Profile 1', 'Profile 2']
    .map((p) => join(root, p))
    .filter((d) => existsSync(join(d, 'Bookmarks')) || existsSync(join(d, 'History')));
}

export function detectSources(): BrowserImportSource[] {
  const defs: { id: BrowserImportSource['id']; name: string }[] = [
    { id: 'chrome', name: 'Google Chrome' },
    { id: 'brave', name: 'Brave' },
    { id: 'edge', name: 'Microsoft Edge' },
  ];
  return defs.map((d) => ({ ...d, available: profileDirs(d.id).length > 0 }));
}

/** Chrome's WebKit timestamps are microseconds since 1601-01-01. */
function chromeTimeToMs(t: number): number {
  return Math.round(t / 1000 - 11644473600000);
}

function importBookmarks(ctx: AppContext, dir: string): number {
  const file = join(dir, 'Bookmarks');
  if (!existsSync(file)) return 0;
  const data = JSON.parse(readFileSync(file, 'utf8')) as ChromeBookmarks;
  const state = ctx.store.state;
  const spaceId = state.activeSpaceId;
  const now = Date.now();
  let count = 0;
  const walk = (node: ChromeBookmarkNode, parentFolderId: Id | null, depth: number): void => {
    for (const child of node.children ?? []) {
      if (child.type === 'url' && child.url && /^https?:/i.test(child.url)) {
        const tab = createTab({ url: child.url, spaceId, kind: 'pinned', title: child.name, now });
        ctx.store.dispatch({ type: 'tab/open', tab, activate: false });
        if (parentFolderId) {
          ctx.store.dispatch({
            type: 'tab/move',
            id: tab.id,
            to: { container: { kind: 'folder', folderId: parentFolderId }, index: Number.MAX_SAFE_INTEGER },
            now,
          });
        }
        count++;
      } else if (child.type === 'folder' && depth < 6) {
        const folder = createFolder({ spaceId, name: child.name || 'Folder' });
        ctx.store.dispatch({ type: 'folder/create', folder, ...(parentFolderId ? { parentFolderId } : {}) });
        walk(child, folder.id, depth + 1);
      }
    }
  };
  const bar = data.roots.bookmark_bar;
  const other = data.roots.other;
  if (bar) {
    const topFolder = createFolder({ spaceId, name: 'Bookmarks bar', emoji: '📑' });
    ctx.store.dispatch({ type: 'folder/create', folder: topFolder });
    walk(bar, topFolder.id, 1);
  }
  if (other?.children?.length) {
    const otherFolder = createFolder({ spaceId, name: 'Other bookmarks', emoji: '📚' });
    ctx.store.dispatch({ type: 'folder/create', folder: otherFolder });
    walk(other, otherFolder.id, 1);
  }
  return count;
}

function importHistory(ctx: AppContext, dir: string): number {
  const file = join(dir, 'History');
  if (!existsSync(file)) return 0;
  // Chrome keeps the DB locked while running: read from a temp copy.
  const tmp = mkdtempSync(join(tmpdir(), 'vela-import-'));
  const copy = join(tmp, 'History');
  copyFileSync(file, copy);
  let count = 0;
  try {
    const db = new Database(copy, { readonly: true, fileMustExist: true });
    const rows = db
      .prepare(
        'SELECT url, title, last_visit_time, visit_count FROM urls WHERE hidden = 0 ORDER BY last_visit_time DESC LIMIT 20000',
      )
      .all() as { url: string; title: string; last_visit_time: number; visit_count: number }[];
    db.close();
    const insert = ctx.db.prepare(
      `INSERT INTO history (url, title, favicon, last_visit, visit_count) VALUES (?, ?, NULL, ?, ?)
       ON CONFLICT(url) DO UPDATE SET visit_count = MAX(visit_count, excluded.visit_count), last_visit = MAX(last_visit, excluded.last_visit),
       title = CASE WHEN title = '' THEN excluded.title ELSE title END`,
    );
    ctx.db.transaction(() => {
      for (const r of rows) {
        if (!/^https?:/i.test(r.url)) continue;
        insert.run(r.url, r.title ?? '', chromeTimeToMs(r.last_visit_time), Math.max(1, r.visit_count));
        count++;
      }
    })();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return count;
}

export function runImport(
  ctx: AppContext,
  source: BrowserImportSource['id'],
  bookmarks: boolean,
  history: boolean,
): ImportResult {
  const dir = profileDirs(source)[0];
  if (!dir) return { bookmarks: 0, history: 0 };
  const result: ImportResult = { bookmarks: 0, history: 0 };
  if (bookmarks) result.bookmarks = importBookmarks(ctx, dir);
  if (history) result.history = importHistory(ctx, dir);
  ctx.prefs.set({ importedFrom: source });
  return result;
}
