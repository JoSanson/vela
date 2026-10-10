import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { LATEST_SCHEMA, migrate } from './migrations';

export type Db = Database.Database;

const BACKUPS_TO_KEEP = 3;

export class NewerSchemaError extends Error {
  constructor(public readonly found: number) {
    super(`state.db was written by a newer Vela (schema ${found} > ${LATEST_SCHEMA})`);
  }
}

function tryOpen(file: string): Db {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('temp_store = MEMORY');
  const check = db.pragma('quick_check', { simple: true }) as string;
  if (check !== 'ok') {
    db.close();
    throw new Error(`quick_check: ${check}`);
  }
  const version = (db.pragma('user_version', { simple: true }) as number) ?? 0;
  if (version > LATEST_SCHEMA) {
    db.close();
    throw new NewerSchemaError(version);
  }
  if (version < LATEST_SCHEMA && version > 0) backup(db, file, `before-migrate-${version}`);
  migrate(db);
  return db;
}

/** `VACUUM INTO` a sibling file; the newest few are kept. Never throws. */
export function backup(db: Db, file: string, label: string): string | null {
  const dir = dirname(file);
  const target = join(dir, `${basename(file)}.${label}-${Date.now()}.bak`);
  try {
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    const olds = readdirSync(dir)
      .filter((f) => f.startsWith(`${basename(file)}.`) && f.endsWith('.bak'))
      .sort();
    for (const old of olds.slice(0, -BACKUPS_TO_KEEP)) rmSync(join(dir, old), { force: true });
    return target;
  } catch (err) {
    console.warn('[db] backup failed', err);
    return null;
  }
}

function newestBackup(file: string): string | null {
  const dir = dirname(file);
  const candidates = readdirSync(dir)
    .filter((f) => f.startsWith(`${basename(file)}.`) && f.endsWith('.bak'))
    .sort();
  const last = candidates[candidates.length - 1];
  return last ? join(dir, last) : null;
}

function quarantine(file: string): void {
  const stamp = Date.now();
  for (const suffix of ['', '-wal', '-shm']) {
    const f = `${file}${suffix}`;
    if (existsSync(f)) renameSync(f, `${file}.corrupt-${stamp}${suffix}`);
  }
}

/**
 * Opens the state database and refuses to be the reason Vela cannot start: a corrupt file is
 * quarantined and the newest backup (or a fresh database) takes its place. A database written by
 * a newer Vela is left untouched (NewerSchemaError) so a downgrade never destroys data.
 */
export function openDatabase(file: string): { db: Db; recovered: 'backup' | 'fresh' | null } {
  mkdirSync(dirname(file), { recursive: true });
  try {
    return { db: tryOpen(file), recovered: null };
  } catch (err) {
    if (err instanceof NewerSchemaError) throw err;
    console.error('[db] state.db unusable, recovering', err);
  }
  quarantine(file);
  const restore = newestBackup(file);
  if (restore) {
    try {
      const src = new Database(restore, { readonly: true });
      src.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      src.close();
      return { db: tryOpen(file), recovered: 'backup' };
    } catch (err) {
      console.error('[db] backup restore failed', err);
      quarantine(file);
    }
  }
  return { db: tryOpen(file), recovered: 'fresh' };
}
