import type { HistoryEntry } from '@vela/shared';
import type { Db } from './database';

const IGNORED_SCHEMES = ['vela:', 'about:', 'data:', 'blob:', 'chrome:', 'devtools:', 'file:', 'javascript:'];

export class HistoryRepo {
  private readonly upsert;
  private readonly upsertSpace;
  private readonly insertVisit;
  private readonly updateTitle;
  private readonly updateFavicon;

  constructor(private readonly db: Db) {
    this.upsert = db.prepare(`
      INSERT INTO history (url, title, last_visit, visit_count) VALUES (?, ?, ?, 1)
      ON CONFLICT(url) DO UPDATE SET last_visit = excluded.last_visit, visit_count = visit_count + 1,
        title = CASE WHEN excluded.title <> '' THEN excluded.title ELSE title END
      RETURNING id
    `);
    this.upsertSpace = db.prepare(`
      INSERT INTO history_spaces (history_id, space_id, last_visit, visit_count) VALUES (?, ?, ?, 1)
      ON CONFLICT(history_id, space_id) DO UPDATE SET last_visit = excluded.last_visit, visit_count = visit_count + 1
    `);
    this.insertVisit = db.prepare('INSERT INTO visits (history_id, visited_at, space_id) VALUES (?, ?, ?)');
    this.updateTitle = db.prepare('UPDATE history SET title = ? WHERE url = ?');
    this.updateFavicon = db.prepare('UPDATE history SET favicon = ? WHERE url = ?');
  }

  static isRecordable(url: string): boolean {
    return !!url && !IGNORED_SCHEMES.some((s) => url.startsWith(s));
  }

  /** `spaceId` is the Space the visit happened in; the history is sealed per Space (D030). */
  recordVisit(url: string, title: string, spaceId = '', now = Date.now()): void {
    if (!HistoryRepo.isRecordable(url)) return;
    const row = this.upsert.get(url, title, now) as { id: number } | undefined;
    if (!row) return;
    if (spaceId) this.upsertSpace.run(row.id, spaceId, now);
    this.insertVisit.run(row.id, now, spaceId);
  }

  setTitle(url: string, title: string): void {
    if (!HistoryRepo.isRecordable(url) || !title) return;
    this.updateTitle.run(title, url);
  }

  setFavicon(url: string, favicon: string): void {
    if (!HistoryRepo.isRecordable(url)) return;
    this.updateFavicon.run(favicon, url);
  }

  /**
   * Full-text search (FTS5 prefix tokens) with a LIKE fallback for queries made of punctuation only.
   * With `spaceId`, only pages visited from that Space are returned, ordered by that Space's last
   * visit; without it, everything (the history page).
   */
  search(query: string, limit = 50, offset = 0, spaceId?: string): HistoryEntry[] {
    const q = query.trim();
    const cols =
      spaceId === undefined
        ? 'h.id, h.url, h.title, h.favicon, h.last_visit AS visitedAt, h.visit_count AS visitCount'
        : 'h.id, h.url, h.title, h.favicon, hs.last_visit AS visitedAt, hs.visit_count AS visitCount';
    const scope =
      spaceId === undefined ? '' : 'JOIN history_spaces hs ON hs.history_id = h.id AND hs.space_id = ?';
    const order = spaceId === undefined ? 'h.last_visit' : 'hs.last_visit';
    const scopeArgs = spaceId === undefined ? [] : [spaceId];
    const tokens = q
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .map((t) => `"${t.replace(/"/g, '""')}"*`);
    if (q && tokens.length) {
      try {
        return this.db
          .prepare(
            `SELECT ${cols} FROM history_fts f JOIN history h ON h.id = f.rowid ${scope}
             WHERE history_fts MATCH ? ORDER BY ${order} DESC LIMIT ? OFFSET ?`,
          )
          .all(...scopeArgs, tokens.join(' '), limit, offset) as HistoryEntry[];
      } catch {
        /* malformed MATCH: fall back to LIKE */
      }
    }
    if (q) {
      return this.db
        .prepare(
          `SELECT ${cols} FROM history h ${scope} WHERE h.url LIKE ? OR h.title LIKE ?
           ORDER BY ${order} DESC LIMIT ? OFFSET ?`,
        )
        .all(...scopeArgs, `%${q}%`, `%${q}%`, limit, offset) as HistoryEntry[];
    }
    return this.db
      .prepare(`SELECT ${cols} FROM history h ${scope} ORDER BY ${order} DESC LIMIT ? OFFSET ?`)
      .all(...scopeArgs, limit, offset) as HistoryEntry[];
  }

  delete(opts: { ids?: number[]; all?: boolean; url?: string }): void {
    if (opts.all) {
      this.db.exec('DELETE FROM visits; DELETE FROM history;');
      return;
    }
    if (opts.url) this.db.prepare('DELETE FROM history WHERE url = ?').run(opts.url);
    if (opts.ids?.length) {
      const del = this.db.prepare('DELETE FROM history WHERE id = ?');
      this.db.transaction(() => opts.ids?.forEach((id) => del.run(id)))();
    }
  }

  /** Visits older than `before` are dropped; the history rows (and their visit counts) stay. */
  pruneVisits(before: number): number {
    return this.db.prepare('DELETE FROM visits WHERE visited_at < ?').run(before).changes;
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS c FROM history').get() as { c: number }).c;
  }
}
