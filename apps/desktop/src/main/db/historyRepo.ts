import type { HistoryEntry } from '@vela/shared';
import type { Db } from './database';

const IGNORED_SCHEMES = ['vela:', 'about:', 'data:', 'blob:', 'chrome:', 'devtools:', 'file:', 'javascript:'];

export class HistoryRepo {
  private readonly upsert;
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
    this.insertVisit = db.prepare('INSERT INTO visits (history_id, visited_at) VALUES (?, ?)');
    this.updateTitle = db.prepare('UPDATE history SET title = ? WHERE url = ?');
    this.updateFavicon = db.prepare('UPDATE history SET favicon = ? WHERE url = ?');
  }

  static isRecordable(url: string): boolean {
    return !!url && !IGNORED_SCHEMES.some((s) => url.startsWith(s));
  }

  recordVisit(url: string, title: string, now = Date.now()): void {
    if (!HistoryRepo.isRecordable(url)) return;
    const row = this.upsert.get(url, title, now) as { id: number } | undefined;
    if (row) this.insertVisit.run(row.id, now);
  }

  setTitle(url: string, title: string): void {
    if (!HistoryRepo.isRecordable(url) || !title) return;
    this.updateTitle.run(title, url);
  }

  setFavicon(url: string, favicon: string): void {
    if (!HistoryRepo.isRecordable(url)) return;
    this.updateFavicon.run(favicon, url);
  }

  /** Full-text search (FTS5 prefix tokens) with a LIKE fallback for queries made of punctuation only. */
  search(query: string, limit = 50, offset = 0): HistoryEntry[] {
    const q = query.trim();
    const tokens = q
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .map((t) => `"${t.replace(/"/g, '""')}"*`);
    if (q && tokens.length) {
      try {
        return this.db
          .prepare(
            `SELECT h.id, h.url, h.title, h.favicon, h.last_visit AS visitedAt, h.visit_count AS visitCount
             FROM history_fts f JOIN history h ON h.id = f.rowid
             WHERE history_fts MATCH ? ORDER BY h.last_visit DESC LIMIT ? OFFSET ?`,
          )
          .all(tokens.join(' '), limit, offset) as HistoryEntry[];
      } catch {
        /* malformed MATCH: fall back to LIKE */
      }
    }
    const rows = (
      q
        ? this.db
            .prepare(
              `SELECT id, url, title, favicon, last_visit AS visitedAt, visit_count AS visitCount FROM history
               WHERE url LIKE ? OR title LIKE ? ORDER BY last_visit DESC LIMIT ? OFFSET ?`,
            )
            .all(`%${q}%`, `%${q}%`, limit, offset)
        : this.db
            .prepare(
              `SELECT id, url, title, favicon, last_visit AS visitedAt, visit_count AS visitCount FROM history
               ORDER BY last_visit DESC LIMIT ? OFFSET ?`,
            )
            .all(limit, offset)
    ) as HistoryEntry[];
    return rows;
  }

  /** Top entries for the command bar index (frecency-ish: recent + frequent). */
  topForIndex(limit = 3000): HistoryEntry[] {
    return this.db
      .prepare(
        `SELECT id, url, title, favicon, last_visit AS visitedAt, visit_count AS visitCount FROM history
         ORDER BY (visit_count * 86400000 + last_visit) DESC LIMIT ?`,
      )
      .all(limit) as HistoryEntry[];
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
