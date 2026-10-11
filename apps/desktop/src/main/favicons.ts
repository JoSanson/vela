import { hostOf } from '@vela/core';
import type { Session } from 'electron';
import { randomBytes } from 'node:crypto';
import type { FaviconsRepo } from './db/repos';

const MAX_BYTES = 256 * 1024;
const TTL_MS = 7 * 24 * 3600 * 1000;
const HTML_PROBE_BYTES = 96 * 1024;

/** The best `<link rel="icon">` in a page head (prefers SVG/PNG over .ico), or null. */
export function iconLinkFrom(html: string, pageUrl: string): string | null {
  const head = html.slice(0, HTML_PROBE_BYTES);
  const links = head.match(/<link\b[^>]*>/gi) ?? [];
  let best: { href: string; score: number } | null = null;
  for (const tag of links) {
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    if (!/(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/.test(rel)) continue;
    const href = /\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1];
    if (!href) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    const sizes = /\bsizes\s*=\s*["']?(\d+)/i.exec(tag)?.[1];
    const size = sizes ? Number(sizes) : 0;
    let score = rel.includes('apple-touch') ? 1 : 2;
    if (type.includes('svg') || href.endsWith('.svg')) score += 3;
    else if (type.includes('png') || href.endsWith('.png')) score += 2 + Math.min(1, size / 64);
    if (!best || score > best.score) best = { href, score };
  }
  if (!best) return null;
  try {
    return new URL(best.href, pageUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Fetches favicons with the tab's own session (cookies/profile respected), stores them in SQLite
 * and serves them as `vela://favicon/<token>/<host>` so the shell never talks to websites directly.
 * The token is generated per launch and only handed to Vela's own documents (snapshot/get): the
 * persisted URLs stay tokenless and the renderer inserts the current token when rendering.
 */
export class FaviconCache {
  private inflight = new Map<string, Promise<string | null>>();
  readonly token = randomBytes(16).toString('hex');

  constructor(private readonly repo: FaviconsRepo) {}

  internalUrl(pageUrl: string, version: number): string {
    return `vela://favicon/${encodeURIComponent(hostOf(pageUrl) || 'unknown')}?v=${version}`;
  }

  /** Returns the internal URL once cached, or null when the icon cannot be cached. */
  async cache(ses: Session, pageUrl: string, iconUrl: string): Promise<string | null> {
    const host = hostOf(pageUrl);
    if (!host || !/^https?:/i.test(iconUrl)) return null;
    const existing = this.repo.get(host);
    if (existing && Date.now() - existing.updatedAt < TTL_MS && existing.data.length > 0) {
      return this.internalUrl(pageUrl, existing.updatedAt);
    }
    const running = this.inflight.get(host);
    if (running) return running;
    const task = (async (): Promise<string | null> => {
      try {
        const res = await ses.fetch(iconUrl, {
          headers: { Accept: 'image/*' },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return null;
        const mime = res.headers.get('content-type') ?? 'image/x-icon';
        if (!mime.startsWith('image/')) return null;
        const declared = Number(res.headers.get('content-length') ?? '0');
        if (declared > MAX_BYTES) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0 || buf.length > MAX_BYTES) return null;
        const now = Date.now();
        this.repo.set(host, mime.split(';')[0] ?? mime, buf, now);
        return this.internalUrl(pageUrl, now);
      } catch {
        return null;
      } finally {
        this.inflight.delete(host);
      }
    })();
    this.inflight.set(host, task);
    return task;
  }

  /**
   * Finds and caches an icon for a page that has never been loaded (imports): `/favicon.ico`
   * first, then the icon links in the page head. Never throws.
   */
  async discover(ses: Session, pageUrl: string): Promise<string | null> {
    let origin: string;
    try {
      origin = new URL(pageUrl).origin;
    } catch {
      return null;
    }
    const host = hostOf(pageUrl);
    const existing = host ? this.repo.get(host) : undefined;
    if (existing && existing.data.length > 0) return this.internalUrl(pageUrl, existing.updatedAt);
    const direct = await this.cache(ses, pageUrl, `${origin}/favicon.ico`);
    if (direct) return direct;
    try {
      const res = await ses.fetch(pageUrl, {
        headers: { Accept: 'text/html' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null;
      const html = (await res.text()).slice(0, HTML_PROBE_BYTES);
      const link = iconLinkFrom(html, res.url || pageUrl);
      return link ? this.cache(ses, pageUrl, link) : null;
    } catch {
      return null;
    }
  }

  /** `path` is `<token>/<host>`; anything without the launch token is refused. */
  serve(path: string): { mime: string; data: Buffer } | null {
    const slash = path.indexOf('/');
    if (slash === -1 || path.slice(0, slash) !== this.token) return null;
    const row = this.repo.get(path.slice(slash + 1));
    return row ? { mime: row.mime, data: row.data } : null;
  }
}
