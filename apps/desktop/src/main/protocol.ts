import { net, protocol, type Session } from 'electron';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

export const INTERNAL_SCHEME = 'vela';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json',
};

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' vela: data: blob: https: http:; font-src 'self' data:; connect-src 'self' vela: http://localhost:* ws://localhost:*; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

/** Must run before app.whenReady(). */
export function registerInternalScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: INTERNAL_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
    },
  ]);
}

/**
 * vela://<page>/<path>  → pages.html (SPA, routes on location.host) or a bundled asset.
 * Registered per session so tabs in any profile can show internal pages.
 */
export type FaviconProvider = (host: string) => { mime: string; data: Buffer } | null;

export function installInternalProtocol(
  ses: Session,
  rendererDir: string,
  devUrl: string | undefined,
  favicons: FaviconProvider,
): void {
  if (ses.protocol.isProtocolHandled(INTERNAL_SCHEME)) return;
  ses.protocol.handle(INTERNAL_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.hostname === 'favicon') {
      const host = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      const icon = favicons(host);
      if (!icon) return new Response(null, { status: 404 });
      return new Response(new Uint8Array(icon.data), {
        status: 200,
        headers: { 'Content-Type': icon.mime, 'Cache-Control': 'public, max-age=604800' },
      });
    }
    const pathname = decodeURIComponent(url.pathname);
    const isAsset = pathname.startsWith('/assets/') || extname(pathname) !== '';
    const headers = { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff' };
    if (devUrl) {
      const target = isAsset ? `${devUrl}${pathname}${url.search}` : `${devUrl}/pages.html`;
      const res = await net.fetch(target, { headers: { Accept: request.headers.get('Accept') ?? '*/*' } });
      const h = new Headers(res.headers);
      for (const [k, v] of Object.entries(headers)) h.set(k, v);
      return new Response(res.body, { status: res.status, headers: h });
    }
    const rel = isAsset ? pathname.replace(/^\/+/, '') : 'pages.html';
    const file = normalize(join(rendererDir, rel));
    if (!file.startsWith(rendererDir)) return new Response('forbidden', { status: 403 });
    try {
      const body = await readFile(file);
      const type = MIME[extname(file)] ?? 'application/octet-stream';
      return new Response(body, { status: 200, headers: { 'Content-Type': type, ...headers } });
    } catch {
      return new Response('not found', { status: 404, headers });
    }
  });
}

export function rendererFileUrl(rendererDir: string, file: string): string {
  return pathToFileURL(join(rendererDir, file)).toString();
}
