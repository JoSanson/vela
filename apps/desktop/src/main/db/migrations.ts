import type { Database } from 'better-sqlite3';

export interface Migration {
  version: number;
  up: (db: Database) => void;
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE spaces (id TEXT PRIMARY KEY, position INTEGER NOT NULL, data TEXT NOT NULL);
        CREATE TABLE tabs (id TEXT PRIMARY KEY, space_id TEXT, data TEXT NOT NULL);
        CREATE TABLE folders (id TEXT PRIMARY KEY, space_id TEXT NOT NULL, data TEXT NOT NULL);
        CREATE TABLE archive (
          id TEXT PRIMARY KEY,
          archived_at INTEGER NOT NULL,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          data TEXT NOT NULL
        );
        CREATE INDEX archive_time ON archive (archived_at DESC);
        CREATE TABLE atc_rules (id TEXT PRIMARY KEY, position INTEGER NOT NULL, data TEXT NOT NULL);
        CREATE TABLE profiles (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE history (
          id INTEGER PRIMARY KEY,
          url TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL DEFAULT '',
          favicon TEXT,
          last_visit INTEGER NOT NULL,
          visit_count INTEGER NOT NULL DEFAULT 1
        );
        CREATE INDEX history_last_visit ON history (last_visit DESC);
        CREATE TABLE visits (
          id INTEGER PRIMARY KEY,
          history_id INTEGER NOT NULL REFERENCES history(id) ON DELETE CASCADE,
          visited_at INTEGER NOT NULL
        );
        CREATE INDEX visits_time ON visits (visited_at DESC);
        CREATE TABLE downloads (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, data TEXT NOT NULL);
        CREATE TABLE permissions (
          origin TEXT NOT NULL,
          permission TEXT NOT NULL,
          decision TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (origin, permission)
        );
        CREATE TABLE boosts (id TEXT PRIMARY KEY, host TEXT NOT NULL, data TEXT NOT NULL);
        CREATE INDEX boosts_host ON boosts (host);
        CREATE TABLE favicons (
          host TEXT PRIMARY KEY,
          mime TEXT NOT NULL,
          data BLOB NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    },
  },
];

migrations.push({
  version: 2,
  up: (db) => {
    db.exec(`
      CREATE VIRTUAL TABLE history_fts USING fts5(title, url, content='history', content_rowid='id', tokenize='unicode61');
      INSERT INTO history_fts(rowid, title, url) SELECT id, title, url FROM history;
      CREATE TRIGGER history_ai AFTER INSERT ON history BEGIN
        INSERT INTO history_fts(rowid, title, url) VALUES (new.id, new.title, new.url);
      END;
      CREATE TRIGGER history_ad AFTER DELETE ON history BEGIN
        INSERT INTO history_fts(history_fts, rowid, title, url) VALUES ('delete', old.id, old.title, old.url);
      END;
      CREATE TRIGGER history_au AFTER UPDATE OF title, url ON history BEGIN
        INSERT INTO history_fts(history_fts, rowid, title, url) VALUES ('delete', old.id, old.title, old.url);
        INSERT INTO history_fts(rowid, title, url) VALUES (new.id, new.title, new.url);
      END;
    `);
  },
});

migrations.push({
  version: 3,
  up: (db) => {
    db.exec(`
      CREATE TABLE credentials (
        id TEXT PRIMARY KEY,
        origin TEXT NOT NULL,
        username TEXT NOT NULL,
        secret BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_used_at INTEGER,
        UNIQUE (origin, username)
      );
      CREATE INDEX credentials_origin ON credentials (origin);
      CREATE TABLE credentials_never (origin TEXT PRIMARY KEY, added_at INTEGER NOT NULL);
    `);
  },
});

// History is sealed per Space (D030): a page visited from two Spaces keeps one row (FTS, favicon)
// and one presence per Space. Earlier visits carry no Space and only show on the history page.
migrations.push({
  version: 4,
  up: (db) => {
    db.exec(`
      CREATE TABLE history_spaces (
        history_id INTEGER NOT NULL REFERENCES history(id) ON DELETE CASCADE,
        space_id TEXT NOT NULL,
        last_visit INTEGER NOT NULL,
        visit_count INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (history_id, space_id)
      );
      CREATE INDEX history_spaces_recent ON history_spaces (space_id, last_visit DESC);
      ALTER TABLE visits ADD COLUMN space_id TEXT NOT NULL DEFAULT '';
    `);
  },
});

export const LATEST_SCHEMA = migrations[migrations.length - 1]?.version ?? 0;

export function migrate(db: Database): number {
  const current = (db.pragma('user_version', { simple: true }) as number) ?? 0;
  const pending = migrations.filter((m) => m.version > current).sort((a, b) => a.version - b.version);
  for (const m of pending) {
    db.transaction(() => {
      m.up(db);
      db.pragma(`user_version = ${m.version}`);
    })();
  }
  return pending.length ? (pending[pending.length - 1]?.version ?? current) : current;
}
