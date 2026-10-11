import { createProfile, hostOf, type CoreState, type Id } from '@vela/core';
import type {
  BrowserImportSource,
  BrowserImportSourceId,
  ImportResult,
  BrowserImportSourceError,
} from '@vela/shared';
import Database from 'better-sqlite3';
import { app } from 'electron';
import { execFile } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import type { AppContext } from './context';
import { applyArcSidebar, parseArcSidebar, type ArcImportCounts } from './importers/arc';
import {
  chromiumKey,
  cookieRowToSet,
  loginsToCredentials,
  profileNamesFromLocalState,
  SAFE_STORAGE,
  type ChromiumCookieRow,
  type ChromiumLoginRow,
} from './importers/chromiumSecrets';
import { chromeBookmarksToTree, chromeTimeToMs, type ChromeBookmarks } from './importers/chromium';
import {
  FIREFOX_BOOKMARKS_SQL,
  FIREFOX_HISTORY_SQL,
  firefoxHistoryToEntries,
  firefoxRowsToTree,
  type FirefoxBookmarkRow,
  type FirefoxHistoryRow,
} from './importers/firefox';
import type { HistoryEntryIn } from './importers/history';
import { parsePlistXml } from './importers/plist';
import {
  SAFARI_HISTORY_SQL,
  safariBookmarksToTree,
  safariHistoryToEntries,
  toSafariNode,
  type SafariHistoryRow,
} from './importers/safari';
import { applyBookmarkTree, type BookmarkFolder } from './importers/tree';

const execFileAsync = promisify(execFile);

/*
 * Where each browser keeps its data, relative to the home folder.
 *   Chrome / Brave / Edge   <base>/{Default,Profile N}/{Bookmarks,History}       (JSON + Chromium sqlite)
 *   Arc                     macOS   Library/Application Support/Arc/StorableSidebar.json
 *                                   Library/Application Support/Arc/User Data/Default/History
 *                           Windows AppData/Local/Packages/TheBrowserCompany.Arc_ttt1ap7aakyb4/LocalCache/Local/Arc/…
 *   Safari                  macOS   Library/Safari/{Bookmarks.plist,History.db}  (needs Full Disk Access)
 *   Firefox                 macOS   Library/Application Support/Firefox/Profiles/<profile>/places.sqlite
 *                           Windows AppData/Roaming/Mozilla/Firefox/Profiles/<profile>/places.sqlite
 *                           Linux   .mozilla/firefox/<profile>/places.sqlite, snap/firefox/common/.mozilla/firefox/…
 * VELA_IMPORT_ROOT points every base at <root>/<source> so tests can plant synthetic data.
 */
const CHROMIUM: Record<'chrome' | 'brave' | 'edge', Record<NodeJS.Platform, string | undefined>> = {
  chrome: {
    darwin: 'Library/Application Support/Google/Chrome',
    win32: 'AppData/Local/Google/Chrome/User Data',
    linux: '.config/google-chrome',
  } as Record<NodeJS.Platform, string | undefined>,
  brave: {
    darwin: 'Library/Application Support/BraveSoftware/Brave-Browser',
    win32: 'AppData/Local/BraveSoftware/Brave-Browser/User Data',
    linux: '.config/BraveSoftware/Brave-Browser',
  } as Record<NodeJS.Platform, string | undefined>,
  edge: {
    darwin: 'Library/Application Support/Microsoft Edge',
    win32: 'AppData/Local/Microsoft/Edge/User Data',
    linux: '.config/microsoft-edge',
  } as Record<NodeJS.Platform, string | undefined>,
};

const ARC: Partial<Record<NodeJS.Platform, string>> = {
  darwin: 'Library/Application Support/Arc',
  win32: 'AppData/Local/Packages/TheBrowserCompany.Arc_ttt1ap7aakyb4/LocalCache/Local/Arc',
};

const SAFARI: Partial<Record<NodeJS.Platform, string>> = { darwin: 'Library/Safari' };

const FIREFOX: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: ['Library/Application Support/Firefox/Profiles'],
  win32: ['AppData/Roaming/Mozilla/Firefox/Profiles'],
  linux: ['.mozilla/firefox', 'snap/firefox/common/.mozilla/firefox'],
};

const CHROMIUM_PROFILES = ['Default', 'Profile 1', 'Profile 2'];

function bases(id: BrowserImportSourceId, platformPaths: string[]): string[] {
  const override = process.env.VELA_IMPORT_ROOT;
  if (override) return [join(override, id)];
  const home = app.getPath('home');
  return platformPaths.map((p) => join(home, p));
}

type Probe = 'ok' | 'missing' | 'denied';

/** `existsSync` is true for TCC-protected files, only opening them reveals the denial. */
function probe(file: string): Probe {
  try {
    closeSync(openSync(file, 'r'));
    return 'ok';
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM' || code === 'EACCES' ? 'denied' : 'missing';
  }
}

function isDenied(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return code === 'EPERM' || code === 'EACCES';
}

interface SecretFiles {
  /** Chromium profile directory name (`Default`, `Profile 3`). */
  dir: string;
  logins: string | null;
  cookies: string | null;
}

interface SourceFiles {
  bookmarks: string | null;
  history: string | null;
  /** Chromium browsers with several profiles: every `History` file with its profile directory. */
  histories?: { dir: string; file: string }[];
  structure: string | null;
  error: BrowserImportSourceError | null;
  /** Per Chromium profile: encrypted logins and cookies (Arc, Chrome, Brave, Edge). */
  secrets?: SecretFiles[];
  /** Chromium `Local State` (profile display names). */
  localState?: string | null;
}

const CHROMIUM_PROFILE_DIR_RE = /^(Default|Profile \d+)$/;

/** Every Chromium profile directory under `root` that has a logins or cookies database. */
function secretFilesUnder(root: string): SecretFiles[] {
  let dirs: string[];
  try {
    dirs = readdirSync(root).filter((d) => CHROMIUM_PROFILE_DIR_RE.test(d));
  } catch {
    return [];
  }
  const out: SecretFiles[] = [];
  for (const dir of dirs.sort()) {
    const logins = join(root, dir, 'Login Data');
    const cookies = join(root, dir, 'Cookies');
    const hasLogins = existsSync(logins);
    const hasCookies = existsSync(cookies);
    if (hasLogins || hasCookies)
      out.push({ dir, logins: hasLogins ? logins : null, cookies: hasCookies ? cookies : null });
  }
  return out;
}

/** Decryption needs the browser's keychain password: macOS prompts once, Linux uses `peanuts`. */
export function secretsSupported(): boolean {
  return process.platform === 'darwin' || process.platform === 'linux' || !!process.env.VELA_IMPORT_KEY;
}

function chromiumFiles(id: 'chrome' | 'brave' | 'edge'): SourceFiles {
  const base = CHROMIUM[id][process.platform];
  const none: SourceFiles = { bookmarks: null, history: null, structure: null, error: null };
  if (!base && !process.env.VELA_IMPORT_ROOT) return none;
  for (const root of bases(id, base ? [base] : [])) {
    for (const p of CHROMIUM_PROFILES) {
      const dir = join(root, p);
      const bookmarks = join(dir, 'Bookmarks');
      const history = join(dir, 'History');
      if (existsSync(bookmarks) || existsSync(history)) {
        const localState = join(root, 'Local State');
        return {
          bookmarks: existsSync(bookmarks) ? bookmarks : null,
          history: existsSync(history) ? history : null,
          structure: null,
          error: null,
          secrets: secretFilesUnder(root),
          localState: existsSync(localState) ? localState : null,
        };
      }
    }
  }
  return none;
}

function arcFiles(): SourceFiles {
  const base = ARC[process.platform];
  const none: SourceFiles = { bookmarks: null, history: null, structure: null, error: null };
  if (!base && !process.env.VELA_IMPORT_ROOT) return none;
  for (const root of bases('arc', base ? [base] : [])) {
    const sidebar = join(root, 'StorableSidebar.json');
    const histories = CHROMIUM_PROFILES.map((p) => ({
      dir: p,
      file: join(root, 'User Data', p, 'History'),
    })).filter((h) => existsSync(h.file));
    const history = histories[0]?.file ?? null;
    if (existsSync(sidebar) || history) {
      const userData = join(root, 'User Data');
      const localState = join(userData, 'Local State');
      return {
        bookmarks: null,
        history,
        histories,
        structure: existsSync(sidebar) ? sidebar : null,
        error: null,
        secrets: secretFilesUnder(userData),
        localState: existsSync(localState) ? localState : null,
      };
    }
  }
  return none;
}

function safariFiles(): SourceFiles {
  const base = SAFARI[process.platform];
  const none: SourceFiles = { bookmarks: null, history: null, structure: null, error: null };
  if (!base && !process.env.VELA_IMPORT_ROOT) return none;
  for (const root of bases('safari', base ? [base] : [])) {
    const bookmarks = join(root, 'Bookmarks.plist');
    const history = join(root, 'History.db');
    const probes = [probe(bookmarks), probe(history)];
    if (probes.includes('denied')) return { ...none, error: 'safari-access' };
    if (probes.includes('ok')) {
      return {
        bookmarks: probes[0] === 'ok' ? bookmarks : null,
        history: probes[1] === 'ok' ? history : null,
        structure: null,
        error: null,
      };
    }
  }
  return none;
}

function firefoxFiles(): SourceFiles {
  const dirs = FIREFOX[process.platform];
  const none: SourceFiles = { bookmarks: null, history: null, structure: null, error: null };
  if (!dirs && !process.env.VELA_IMPORT_ROOT) return none;
  let newest: { file: string; mtime: number } | null = null;
  for (const root of bases('firefox', dirs ?? [])) {
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const file = join(root, entry, 'places.sqlite');
      try {
        const mtime = statSync(file).mtimeMs;
        if (!newest || mtime > newest.mtime) newest = { file, mtime };
      } catch {
        continue;
      }
    }
  }
  // The most recently used profile is the one worth importing; profiles.ini is not consulted.
  if (!newest) return none;
  return { bookmarks: newest.file, history: newest.file, structure: null, error: null };
}

function filesFor(id: BrowserImportSourceId): SourceFiles {
  switch (id) {
    case 'arc':
      return arcFiles();
    case 'safari':
      return safariFiles();
    case 'firefox':
      return firefoxFiles();
    default:
      return chromiumFiles(id);
  }
}

const NAMES: Record<BrowserImportSourceId, string> = {
  arc: 'Arc',
  chrome: 'Google Chrome',
  brave: 'Brave',
  edge: 'Microsoft Edge',
  safari: 'Safari',
  firefox: 'Firefox',
};

export function detectSources(): BrowserImportSource[] {
  const ids: BrowserImportSourceId[] = ['arc', 'chrome', 'brave', 'edge', 'safari', 'firefox'];
  return ids.map((id) => {
    const f = filesFor(id);
    return {
      id,
      name: NAMES[id],
      available: !f.error && !!(f.bookmarks || f.history || f.structure),
      bookmarks: !!f.bookmarks,
      history: !!f.history,
      structure: !!f.structure,
      passwords: secretsSupported() && !!f.secrets?.some((p) => p.logins),
      cookies: secretsSupported() && !!f.secrets?.some((p) => p.cookies),
      error: f.error,
    };
  });
}

function commitTree(ctx: AppContext, roots: BookmarkFolder[]): number {
  // Fold everything through the pure reducer locally and commit once: thousands of bookmarks
  // would otherwise mean thousands of broadcasts, layouts and SQLite rewrites.
  const state: CoreState = ctx.store.state;
  const applied = applyBookmarkTree(state, state.activeSpaceId, roots, Date.now());
  if (applied.count > 0) ctx.store.dispatch({ type: 'state/replace', state: applied.state });
  return applied.count;
}

/** `spaceIds`: the Spaces the pages count as visited from (history is sealed per Space, D030). */
function upsertHistory(ctx: AppContext, entries: HistoryEntryIn[], spaceIds: Id[] = []): number {
  const insert = ctx.db.prepare(
    `INSERT INTO history (url, title, favicon, last_visit, visit_count) VALUES (?, ?, NULL, ?, ?)
     ON CONFLICT(url) DO UPDATE SET visit_count = MAX(visit_count, excluded.visit_count), last_visit = MAX(last_visit, excluded.last_visit),
     title = CASE WHEN title = '' THEN excluded.title ELSE title END
     RETURNING id`,
  );
  const presence = ctx.db.prepare(
    `INSERT INTO history_spaces (history_id, space_id, last_visit, visit_count) VALUES (?, ?, ?, ?)
     ON CONFLICT(history_id, space_id) DO UPDATE SET visit_count = MAX(visit_count, excluded.visit_count),
     last_visit = MAX(last_visit, excluded.last_visit)`,
  );
  let count = 0;
  ctx.db.transaction(() => {
    for (const e of entries) {
      if (!/^https?:/i.test(e.url)) continue;
      const row = insert.get(e.url, e.title, e.lastVisit, e.visitCount) as { id: number } | undefined;
      if (row) for (const sid of spaceIds) presence.run(row.id, sid, e.lastVisit, e.visitCount);
      count++;
    }
  })();
  return count;
}

/**
 * Browsers keep their sqlite files locked (and Safari/Firefox write through a WAL), so every read goes
 * through a temp copy of the database plus its journal siblings.
 */
async function withSqliteCopy<T>(file: string, fn: (db: Database.Database) => T): Promise<T> {
  const tmp = mkdtempSync(join(tmpdir(), 'vela-import-'));
  try {
    const copy = join(tmp, basename(file));
    await copyFile(file, copy);
    for (const suffix of ['-wal', '-shm', '-journal']) {
      if (existsSync(file + suffix)) await copyFile(file + suffix, copy + suffix);
    }
    const db = new Database(copy, { readonly: true, fileMustExist: true });
    try {
      return fn(db);
    } finally {
      db.close();
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function importChromiumBookmarks(ctx: AppContext, file: string): number {
  const data = JSON.parse(readFileSync(file, 'utf8')) as ChromeBookmarks;
  return commitTree(ctx, chromeBookmarksToTree(data));
}

async function importChromiumHistory(ctx: AppContext, file: string, spaceIds: Id[] = []): Promise<number> {
  const rows = await withSqliteCopy(
    file,
    (db) =>
      db
        .prepare(
          'SELECT url, title, last_visit_time, visit_count FROM urls WHERE hidden = 0 ORDER BY last_visit_time DESC LIMIT 20000',
        )
        .all() as { url: string; title: string | null; last_visit_time: number; visit_count: number }[],
  );
  return upsertHistory(
    ctx,
    rows.map((r) => ({
      url: r.url,
      title: r.title ?? '',
      lastVisit: chromeTimeToMs(r.last_visit_time),
      visitCount: Math.max(1, r.visit_count),
    })),
    spaceIds,
  );
}

function localStateNames(file: string | null | undefined): Record<string, string> {
  if (!file) return {};
  try {
    return profileNamesFromLocalState(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return {};
  }
}

function importArcSidebar(
  ctx: AppContext,
  file: string,
  localState: string | null | undefined,
): { counts: ArcImportCounts; profiles: Record<string, Id | null> } {
  const sidebar = parseArcSidebar(JSON.parse(readFileSync(file, 'utf8')));
  const before = new Set(Object.keys(ctx.store.state.tabs));
  const applied = applyArcSidebar(ctx.store.state, sidebar, Date.now(), localStateNames(localState));
  if (applied.state !== ctx.store.state) {
    ctx.store.dispatch({ type: 'state/replace', state: applied.state });
    prefetchFavicons(
      ctx,
      Object.values(applied.state.tabs)
        .filter((t) => !before.has(t.id) && !t.favicon)
        .map((t) => t.id),
    );
  }
  return { counts: applied.counts, profiles: applied.profiles };
}

/** The browser's OS-crypt password: `VELA_IMPORT_KEY` (tests), the macOS keychain, or `peanuts` on Linux. */
async function safeStoragePassword(source: BrowserImportSourceId): Promise<string | null> {
  if (process.env.VELA_IMPORT_KEY) return process.env.VELA_IMPORT_KEY;
  const entry =
    source === 'arc' || source === 'chrome' || source === 'brave' || source === 'edge'
      ? SAFE_STORAGE[source]
      : null;
  if (!entry) return null;
  if (process.platform === 'linux') return 'peanuts';
  if (process.platform !== 'darwin') return null;
  try {
    const { stdout } = await execFileAsync('/usr/bin/security', [
      'find-generic-password',
      '-w',
      '-s',
      entry.service,
      '-a',
      entry.account,
    ]);
    const pw = stdout.trim();
    return pw || null;
  } catch {
    return null;
  }
}

/** Vela partition for a Chromium profile directory: the default one, or the mapped/created profile. */
function partitionForDir(
  ctx: AppContext,
  dir: string,
  mapping: Record<string, Id | null>,
  names: Record<string, string>,
): string {
  if (dir === 'Default' || mapping[dir] === null) return ctx.sessions.partitionFor(null);
  const mappedId = mapping[dir];
  if (mappedId) {
    const p = ctx.store.state.profiles[mappedId];
    if (p) return p.partition;
  }
  const name = names[dir] ?? dir;
  const existing = Object.values(ctx.store.state.profiles).find((p) => p.name === name && !p.ephemeral);
  if (existing) return existing.partition;
  const profile = createProfile(name, '#6366f1');
  ctx.store.dispatch({ type: 'profile/create', profile });
  return profile.partition;
}

async function importChromiumPasswords(ctx: AppContext, files: SecretFiles[], key: Buffer): Promise<number> {
  let n = 0;
  for (const f of files) {
    if (!f.logins) continue;
    const rows = await withSqliteCopy(
      f.logins,
      (db) =>
        db
          .prepare(
            'SELECT origin_url, username_value, password_value, date_last_used, date_password_modified FROM logins WHERE blacklisted_by_user = 0',
          )
          .all() as ChromiumLoginRow[],
    );
    n += ctx.credentials.importMany(loginsToCredentials(rows, key, Date.now()));
  }
  return n;
}

async function importChromiumCookies(
  ctx: AppContext,
  files: SecretFiles[],
  key: Buffer,
  mapping: Record<string, Id | null>,
  names: Record<string, string>,
): Promise<number> {
  let n = 0;
  const now = Date.now();
  for (const f of files) {
    if (!f.cookies) continue;
    const rows = await withSqliteCopy(
      f.cookies,
      (db) =>
        db
          .prepare(
            'SELECT host_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, samesite, has_expires FROM cookies',
          )
          .all() as ChromiumCookieRow[],
    );
    const ses = ctx.sessions.get(partitionForDir(ctx, f.dir, mapping, names));
    for (const row of rows) {
      const cookie = cookieRowToSet(row, key, now);
      if (!cookie) continue;
      try {
        await ses.cookies.set(cookie);
        n++;
      } catch {
        /* a few cookies (e.g. invalid domains) are rejected by Chromium */
      }
    }
  }
  return n;
}

/**
 * Imported tabs have never been loaded, so they would show letters until first opened; fetch
 * their icons in the background (favorites and pinned first, a few at a time).
 */
export function prefetchFavicons(ctx: AppContext, ids: Id[], concurrency = 4): void {
  const order = (k: string): number => (k === 'favorite' ? 0 : k === 'pinned' ? 1 : 2);
  const queue = ids
    .map((id) => ctx.store.state.tabs[id])
    .filter((t): t is NonNullable<typeof t> => !!t && /^https?:/i.test(t.url))
    .sort((a, b) => order(a.kind) - order(b.kind))
    .slice(0, 300);
  const seenHost = new Set<string>();
  const next = async (): Promise<void> => {
    const tab = queue.shift();
    if (!tab) return;
    const host = hostOf(tab.url);
    const ses = ctx.sessions.forProfile(
      ctx.store.state.spaces[tab.spaceId ?? '']?.profileId ?? null,
      Object.fromEntries(Object.values(ctx.store.state.profiles).map((p) => [p.id, p.partition])),
    );
    const icon = seenHost.has(host)
      ? await ctx.favicons.discover(ses, tab.url)
      : (seenHost.add(host), await ctx.favicons.discover(ses, tab.url));
    if (icon) {
      for (const t of Object.values(ctx.store.state.tabs)) {
        if (!t.favicon && hostOf(t.url) === host)
          ctx.store.dispatch({ type: 'tab/update', id: t.id, patch: { favicon: icon } });
      }
    }
    await next();
  };
  for (let i = 0; i < concurrency; i++) void next();
}

async function importSafariBookmarks(ctx: AppContext, file: string): Promise<number> {
  const { stdout } = await execFileAsync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', file], {
    maxBuffer: 256 * 1024 * 1024,
  });
  const root = toSafariNode(parsePlistXml(stdout));
  return root ? commitTree(ctx, safariBookmarksToTree(root)) : 0;
}

async function importSafariHistory(ctx: AppContext, file: string): Promise<number> {
  const rows = await withSqliteCopy(file, (db) => db.prepare(SAFARI_HISTORY_SQL).all() as SafariHistoryRow[]);
  return upsertHistory(ctx, safariHistoryToEntries(rows));
}

async function importFirefoxBookmarks(ctx: AppContext, file: string): Promise<number> {
  const rows = await withSqliteCopy(
    file,
    (db) => db.prepare(FIREFOX_BOOKMARKS_SQL).all() as FirefoxBookmarkRow[],
  );
  return commitTree(ctx, firefoxRowsToTree(rows));
}

async function importFirefoxHistory(ctx: AppContext, file: string): Promise<number> {
  const rows = await withSqliteCopy(
    file,
    (db) => db.prepare(FIREFOX_HISTORY_SQL).all() as FirefoxHistoryRow[],
  );
  return upsertHistory(ctx, firefoxHistoryToEntries(rows));
}

function describe(ctx: AppContext, err: unknown, source: BrowserImportSourceId): string {
  if (isDenied(err)) {
    return source === 'safari'
      ? ctx.i18n.t('pages.import.safariAccess')
      : ctx.i18n.t('pages.import.accessDenied', { name: NAMES[source] });
  }
  return err instanceof Error ? err.message : String(err);
}

export async function runImport(
  ctx: AppContext,
  source: BrowserImportSourceId,
  bookmarks: boolean,
  history: boolean,
  structure = true,
  passwords = false,
  cookies = false,
): Promise<ImportResult> {
  const files = filesFor(source);
  const result: ImportResult = { bookmarks: 0, history: 0 };
  if (files.error) return { ...result, error: ctx.i18n.t('pages.import.safariAccess') };
  let profileMap: Record<string, Id | null> = {};
  try {
    if (source === 'arc') {
      if (structure && files.structure) {
        const { counts, profiles } = importArcSidebar(ctx, files.structure, files.localState);
        profileMap = profiles;
        result.bookmarks = counts.pinned;
        result.spaces = counts.spaces;
        result.todayTabs = counts.today;
        result.favorites = counts.favorites;
        result.profiles = counts.profiles;
      }
      if (history) {
        // Arc keeps one History per profile: it lands in every Space that uses that profile.
        for (const h of files.histories ?? []) {
          const profileId = profileMap[h.dir] ?? null;
          const spaceIds = Object.values(ctx.store.state.spaces)
            .filter((s) => (s.profileId ?? null) === profileId)
            .map((s) => s.id);
          result.history += await importChromiumHistory(ctx, h.file, spaceIds);
        }
      }
    } else if (source === 'safari') {
      if (bookmarks && files.bookmarks) result.bookmarks = await importSafariBookmarks(ctx, files.bookmarks);
      if (history && files.history) result.history = await importSafariHistory(ctx, files.history);
    } else if (source === 'firefox') {
      if (bookmarks && files.bookmarks) result.bookmarks = await importFirefoxBookmarks(ctx, files.bookmarks);
      if (history && files.history) result.history = await importFirefoxHistory(ctx, files.history);
    } else {
      if (bookmarks && files.bookmarks) result.bookmarks = importChromiumBookmarks(ctx, files.bookmarks);
      if (history && files.history) result.history = await importChromiumHistory(ctx, files.history);
    }
    if ((passwords || cookies) && files.secrets?.length) {
      const password = await safeStoragePassword(source);
      if (!password)
        return { ...result, error: ctx.i18n.t('pages.import.keychainDenied', { name: NAMES[source] }) };
      const key = chromiumKey(password);
      const names = localStateNames(files.localState);
      if (passwords) result.passwords = await importChromiumPasswords(ctx, files.secrets, key);
      if (cookies) result.cookies = await importChromiumCookies(ctx, files.secrets, key, profileMap, names);
    }
  } catch (err) {
    console.warn(`[vela import] ${source} failed:`, err);
    return { ...result, error: describe(ctx, err, source) };
  }
  ctx.prefs.set({ importedFrom: source });
  return result;
}
