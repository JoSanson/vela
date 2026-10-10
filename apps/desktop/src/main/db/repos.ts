import type { Boost, DownloadItemState, PermissionKind, SitePermission } from '@vela/shared';
import type { Db } from './database';

export class DownloadsRepo {
  constructor(private readonly db: Db) {}

  list(): DownloadItemState[] {
    return (
      this.db.prepare('SELECT data FROM downloads ORDER BY started_at DESC LIMIT 500').all() as {
        data: string;
      }[]
    ).map((r) => JSON.parse(r.data) as DownloadItemState);
  }

  save(item: DownloadItemState): void {
    this.db
      .prepare(
        'INSERT INTO downloads (id, started_at, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
      )
      .run(item.id, item.startedAt, JSON.stringify(item));
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM downloads WHERE id = ?').run(id);
  }

  clearFinished(): void {
    for (const d of this.list()) if (d.state !== 'progressing') this.remove(d.id);
  }
}

export class PermissionsRepo {
  constructor(private readonly db: Db) {}

  list(): SitePermission[] {
    return this.db
      .prepare(
        'SELECT origin, permission, decision, updated_at AS updatedAt FROM permissions ORDER BY origin, permission',
      )
      .all() as SitePermission[];
  }

  get(origin: string, permission: string): SitePermission | undefined {
    return this.db
      .prepare(
        'SELECT origin, permission, decision, updated_at AS updatedAt FROM permissions WHERE origin = ? AND permission = ?',
      )
      .get(origin, permission) as SitePermission | undefined;
  }

  set(p: SitePermission): void {
    this.db
      .prepare(
        'INSERT INTO permissions (origin, permission, decision, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(origin, permission) DO UPDATE SET decision = excluded.decision, updated_at = excluded.updated_at',
      )
      .run(p.origin, p.permission, p.decision, p.updatedAt);
  }

  remove(origin: string, permission: PermissionKind): void {
    this.db.prepare('DELETE FROM permissions WHERE origin = ? AND permission = ?').run(origin, permission);
  }
}

export class BoostsRepo {
  constructor(private readonly db: Db) {}

  list(): Boost[] {
    return (this.db.prepare('SELECT data FROM boosts ORDER BY host').all() as { data: string }[]).map(
      (r) => JSON.parse(r.data) as Boost,
    );
  }

  forHost(host: string): Boost[] {
    return (this.db.prepare('SELECT data FROM boosts WHERE host = ?').all(host) as { data: string }[]).map(
      (r) => JSON.parse(r.data) as Boost,
    );
  }

  save(b: Boost): void {
    this.db
      .prepare(
        'INSERT INTO boosts (id, host, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET host = excluded.host, data = excluded.data',
      )
      .run(b.id, b.host, JSON.stringify(b));
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM boosts WHERE id = ?').run(id);
  }
}

export interface FaviconRow {
  host: string;
  mime: string;
  data: Buffer;
  updatedAt: number;
}

export class FaviconsRepo {
  constructor(private readonly db: Db) {}

  get(host: string): FaviconRow | undefined {
    return this.db
      .prepare('SELECT host, mime, data, updated_at AS updatedAt FROM favicons WHERE host = ?')
      .get(host) as FaviconRow | undefined;
  }

  set(host: string, mime: string, data: Buffer, now = Date.now()): void {
    this.db
      .prepare(
        'INSERT INTO favicons (host, mime, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(host) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at',
      )
      .run(host, mime, data, now);
  }
}
