import type { InputUse } from '@vela/core';
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

  /**
   * Command bar candidates for one Space: full-text matches plus the Space's most frecent pages
   * (they make typo tolerance and the empty bar work), plus the pages the user picked before for
   * this input. Ranking itself happens in core (`rankOmnibox`).
   */
  omniCandidates(
    query: string,
    spaceId: string,
    now: number,
    extraUrls: readonly string[] = [],
  ): HistoryEntry[] {
    const cols = 'h.id, h.url, h.title, h.favicon, hs.last_visit AS visitedAt, hs.visit_count AS visitCount';
    const from = 'FROM history h JOIN history_spaces hs ON hs.history_id = h.id AND hs.space_id = ?';
    const frecent = this.frecentOrder(now);
    const byId = new Map<number, HistoryEntry>();
    const add = (rows: HistoryEntry[]): void => rows.forEach((r) => byId.set(r.id, r));
    add(this.topFrecent(spaceId, now));
    const tokens = query
      .trim()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .map((t) => `"${t.replace(/"/g, '""')}"*`);
    if (tokens.length) {
      try {
        add(
          this.db
            .prepare(
              `SELECT ${cols} FROM history_fts f JOIN history h ON h.id = f.rowid
               JOIN history_spaces hs ON hs.history_id = h.id AND hs.space_id = ?
               WHERE history_fts MATCH ? ORDER BY ${frecent} DESC LIMIT 80`,
            )
            .all(spaceId, tokens.join(' ')) as HistoryEntry[],
        );
      } catch {
        /* malformed MATCH: the frecent set still answers */
      }
    }
    const missing = extraUrls.filter((u) => ![...byId.values()].some((r) => r.url === u));
    if (missing.length) {
      add(
        this.db
          .prepare(`SELECT ${cols} ${from} WHERE h.url IN (${missing.map(() => '?').join(',')})`)
          .all(spaceId, ...missing) as HistoryEntry[],
      );
    }
    return [...byId.values()];
  }

  private frecentOrder(now: number): string {
    const d = (days: number): number => now - days * 86_400_000;
    // Integers computed here, never user input: safe to inline.
    return `hs.visit_count * (CASE WHEN hs.last_visit > ${d(4)} THEN 100 WHEN hs.last_visit > ${d(14)} THEN 70
      WHEN hs.last_visit > ${d(31)} THEN 50 WHEN hs.last_visit > ${d(90)} THEN 30 ELSE 10 END)`;
  }

  private frecentCache = new Map<string, { at: number; rows: HistoryEntry[] }>();

  /** The Space's 150 most frecent pages; cached a few seconds since every keystroke asks. */
  private topFrecent(spaceId: string, now: number): HistoryEntry[] {
    const hit = this.frecentCache.get(spaceId);
    if (hit && now - hit.at < 5_000) return hit.rows;
    const rows = this.db
      .prepare(
        `SELECT h.id, h.url, h.title, h.favicon, hs.last_visit AS visitedAt, hs.visit_count AS visitCount
         FROM history_spaces hs JOIN history h ON h.id = hs.history_id
         WHERE hs.space_id = ? AND hs.last_visit > ? ORDER BY ${this.frecentOrder(now)} DESC LIMIT 150`,
      )
      .all(spaceId, now - 365 * 86_400_000) as HistoryEntry[];
    this.frecentCache.set(spaceId, { at: now, rows });
    return rows;
  }

  /** The user typed `input` (normalized) in the command bar and picked `url` (or a `cmd:` id). */
  learnInput(input: string, url: string, spaceId: string, now = Date.now()): void {
    if (!input || !url || !spaceId) return;
    this.db
      .prepare(
        `INSERT INTO input_history (input, url, space_id, use_count, last_used) VALUES (?, ?, ?, 1, ?)
         ON CONFLICT(space_id, input, url) DO UPDATE SET use_count = use_count + 1, last_used = excluded.last_used`,
      )
      .run(input.slice(0, 200), url, spaceId, now);
    this.db.prepare('DELETE FROM input_history WHERE last_used < ?').run(now - 365 * 86_400_000);
  }

  /** Past picks whose input starts with `prefix`, most used first. */
  inputs(prefix: string, spaceId: string, limit = 60): InputUse[] {
    if (!prefix) return [];
    return this.db
      .prepare(
        `SELECT input, url, use_count AS uses, last_used AS lastUsed FROM input_history
         WHERE space_id = ? AND input >= ? AND input < ? ORDER BY use_count DESC LIMIT ?`,
      )
      .all(spaceId, prefix, `${prefix}\uffff`, limit) as InputUse[];
  }

  delete(opts: { ids?: number[]; all?: boolean; url?: string }): void {
    this.frecentCache.clear();
    if (opts.all) {
      this.db.exec('DELETE FROM visits; DELETE FROM history; DELETE FROM input_history;');
      return;
    }
    const forget = this.db.prepare('DELETE FROM input_history WHERE url = ?');
    if (opts.url) {
      this.db.prepare('DELETE FROM history WHERE url = ?').run(opts.url);
      forget.run(opts.url);
    }
    if (opts.ids?.length) {
      const urlOf = this.db.prepare('SELECT url FROM history WHERE id = ?');
      const del = this.db.prepare('DELETE FROM history WHERE id = ?');
      this.db.transaction(() =>
        opts.ids?.forEach((id) => {
          const row = urlOf.get(id) as { url: string } | undefined;
          if (row) forget.run(row.url);
          del.run(id);
        }),
      )();
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
