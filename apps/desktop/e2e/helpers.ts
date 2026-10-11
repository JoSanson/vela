import {
  _electron as electron,
  expect,
  test as base,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import type { AddressInfo } from 'node:net';

const here = __dirname;
export const APP_ROOT = join(here, '..');
export const MAIN_ENTRY = join(APP_ROOT, 'out/main/index.js');
export const SCREENSHOT_DIR = join(APP_ROOT, 'e2e-artifacts/screenshots');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/** Tiny static server for deterministic test pages (no network in e2e). */
export function startFixtureServer(): Promise<{ server: Server; url: string }> {
  const dir = join(here, 'fixtures');
  let port = 0;
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const p = u.pathname === '/' ? '/index.html' : u.pathname;
    if (p === '/download/tool.sh') {
      res.writeHead(200, {
        'Content-Type': 'application/x-sh',
        'Content-Disposition': 'attachment; filename="tool.sh"',
        'Content-Length': '24',
      });
      res.end('#!/bin/sh\necho harmless\n');
      return;
    }
    if (p === '/download/blob.bin') {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="blob.bin"',
        'Content-Length': String(2 * 1024 * 1024),
      });
      res.end(Buffer.alloc(2 * 1024 * 1024, 7));
      return;
    }
    if (p === '/ads/banner.png' || p === '/tracker.js') {
      res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'image/svg+xml' });
      res.end(
        p.endsWith('.js')
          ? 'window.__tracked = true;'
          : '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
      );
      return;
    }
    if (p === '/doc.pdf') {
      const pdf = Buffer.from(
        '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>',
      );
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': String(pdf.length) });
      res.end(pdf);
      return;
    }
    if (p === '/login') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<title>Login</title><form id="f" method="post" action="/welcome"><input id="u" name="user" type="email" autocomplete="username"><input id="p" name="pass" type="password" autocomplete="current-password"><button id="go" type="submit">Sign in</button></form>',
      );
      return;
    }
    if (p === '/welcome') {
      let body = '';
      req.on('data', (c: Buffer) => {
        body += c.toString();
      });
      req.on('end', () => {
        const user = decodeURIComponent((/user=([^&]*)/.exec(body)?.[1] ?? '').replace(/\+/g, ' '));
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<title>Welcome</title><h1 id="hello">hello ${user}</h1>`);
      });
      return;
    }
    if (p === '/external') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<title>External</title><a id="zoom" href="zoommtg://zoom.us/join?confno=1">join</a>');
      return;
    }
    if (p === '/auth') {
      if (req.headers.authorization === `Basic ${Buffer.from('user:pass').toString('base64')}`) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<title>Authed</title><h1 id="authed">welcome user</h1>');
      } else {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Vela test"', 'Content-Type': 'text/html' });
        res.end('<title>401</title><h1 id="denied">denied</h1>');
      }
      return;
    }
    if (p === '/redirect') {
      res.writeHead(302, { Location: u.searchParams.get('to') ?? '/' });
      res.end();
      return;
    }
    if (p === '/slow') {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<title>Slow page</title><h1>slow</h1>');
      }, 1500);
      return;
    }
    if (p === '/dark') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><title>Dark</title><body style="margin:0;background:#151826;color:#eee;font:40px sans-serif;padding:60px">Dark page</body>',
      );
      return;
    }
    if (p.startsWith('/page/')) {
      const name = decodeURIComponent(p.slice(6));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<!doctype html><html><head><title>${name}</title><link rel="icon" href="/favicon.svg"></head><body style="font-family:sans-serif;padding:40px"><h1 data-testid="heading">${name}</h1><p>${'lorem ipsum '.repeat(400)}</p><a id="link" href="/page/${name}-next">next</a><a id="blank" target="_blank" href="/page/${name}-popup">popup</a><a id="ext" href="http://localhost:${port}/page/${name}-external">external</a></body></html>`,
      );
      return;
    }
    try {
      const body = readFileSync(join(dir, p));
      res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, () => {
      port = (server.address() as AddressInfo).port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

export interface VelaApp {
  app: ElectronApplication;
  shell: Page;
  userData: string;
  fixtures: string;
  /** Runs a main-process command (menu accelerator equivalent). */
  command: (id: string, payload?: unknown) => Promise<void>;
  /** Snapshot of the core state from main. */
  state: () => Promise<CoreStateLike>;
  /** Pages for tab WebContents (web content). */
  tabPage: (urlPart: string) => Promise<Page>;
  overlay: () => Promise<Page>;
  /** Resolves once main reports the overlay view detached. */
  overlayHidden: () => Promise<void>;
  /** Opens a URL through the command bar and waits for the tab + overlay close. */
  openTab: (url: string) => Promise<string>;
  shot: (name: string) => Promise<void>;
  close: () => Promise<void>;
}

export interface CoreStateLike {
  activeSpaceId: string;
  spaceOrder: string[];
  spaces: Record<
    string,
    {
      id: string;
      name: string;
      emoji: string | null;
      profileId: string | null;
      activeTabId: string | null;
      today: string[];
      pinned: string[];
      split: { panes: string[] } | null;
    }
  >;
  profiles: Record<string, { id: string; name: string; partition: string }>;
  tabs: Record<
    string,
    {
      id: string;
      url: string;
      title: string;
      customTitle: string | null;
      emoji: string | null;
      favicon: string | null;
      kind: string;
      sleeping: boolean;
      loaded: boolean;
      spaceId: string | null;
      audible: boolean;
      muted: boolean;
      zoom: number;
    }
  >;
  folders: Record<
    string,
    { id: string; name: string; spaceId: string; children: string[]; collapsed: boolean }
  >;
  favorites: string[];
  mru: string[];
  archive: { id: string; url: string; title: string; reason: string }[];
}

export async function launchVela(
  opts: { userData?: string; fixtures: string; env?: Record<string, string> } = { fixtures: '' },
): Promise<VelaApp> {
  const userData = opts.userData ?? mkdtempSync(join(tmpdir(), 'vela-e2e-'));
  const app = await electron.launch({
    args: [MAIN_ENTRY, '--no-sandbox-for-tests-placeholder'].slice(0, 1),
    env: {
      ...process.env,
      VELA_USER_DATA: userData,
      VELA_DOWNLOAD_DIR: userData,
      VELA_E2E: '1',
      VELA_LOCALE: 'en-US',
      ELECTRON_ENABLE_LOGGING: '0',
      ...(opts.env ?? {}),
    },
    timeout: 30_000,
  });
  const shell = await app.firstWindow();
  await shell.waitForSelector('[data-testid="sidebar"]', { timeout: 15_000 });
  await shell.waitForSelector('[data-ready="true"]', { timeout: 15_000 });
  await expect
    .poll(() => app.windows().some((w) => w.url().includes('overlay.html')), { timeout: 15_000 })
    .toBe(true);

  const command = async (id: string, payload?: unknown): Promise<void> => {
    await app.evaluate(
      (_electron, { id, payload }) => {
        const g = globalThis as unknown as { __vela: { runCommand: (i: string, p?: unknown) => void } };
        g.__vela.runCommand(id, payload);
      },
      { id, payload },
    );
  };
  const state = (): Promise<CoreStateLike> =>
    app.evaluate(() => {
      const g = globalThis as unknown as { __vela: { ctx: { store: { state: unknown } } } };
      return JSON.parse(JSON.stringify(g.__vela.ctx.store.state)) as never;
    });
  const tabPage = async (urlPart: string): Promise<Page> => {
    await expect
      .poll(() => app.windows().some((w) => w.url().includes(urlPart)), { timeout: 15_000 })
      .toBe(true);
    const p = app.windows().find((w) => w.url().includes(urlPart));
    if (!p) throw new Error(`no page for ${urlPart}`);
    return p;
  };
  const overlay = (): Promise<Page> => tabPage('overlay.html');
  // Hidden = state flipped and the native view detached (main keeps it ~110 ms for the exit animation).
  const overlayHidden = async (): Promise<void> => {
    await expect
      .poll(() =>
        app.evaluate(() => {
          const g = globalThis as unknown as {
            __vela: {
              ctx: {
                overlay: { visible: boolean; view: unknown };
                windows: { main: { win: { contentView: { children: unknown[] } } } | null };
              };
            };
          };
          const { overlay, windows } = g.__vela.ctx;
          const attached = windows.main?.win.contentView.children.includes(overlay.view) ?? false;
          return overlay.visible || attached;
        }),
      )
      .toBe(false);
  };
  const openTab = async (url: string): Promise<string> => {
    await overlayHidden();
    await command('newTab');
    const ov = await overlay();
    const input = ov.getByTestId('command-input');
    await expect(input).toBeVisible();
    await input.fill(url);
    await input.press('Enter');
    await expect.poll(async () => Object.values(await state()).length).toBeGreaterThan(0);
    let id = '';
    await expect
      .poll(async () => {
        const st = await state();
        id = Object.values(st.tabs).find((t) => t.url === url)?.id ?? '';
        return id;
      })
      .not.toBe('');
    await overlayHidden();
    return id;
  };
  /** Captures shell + every attached tab view + overlay and composites them like the real window. */
  const shot = async (name: string): Promise<void> => {
    // Let entrance animations finish so captures are deterministic.
    await shell
      .evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
      .catch(() => undefined);
    const layers = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win)
        return {
          width: 0,
          height: 0,
          layers: [] as {
            dataUrl: string;
            bounds: { x: number; y: number; width: number; height: number };
          }[],
        };
      const [width, height] = win.getContentSize();
      const out: { dataUrl: string; bounds: { x: number; y: number; width: number; height: number } }[] = [];
      const shellImg = await win.webContents.capturePage();
      out.push({
        dataUrl: shellImg.toDataURL(),
        bounds: { x: 0, y: 0, width: width ?? 0, height: height ?? 0 },
      });
      for (const child of win.contentView.children) {
        const v = child as unknown as {
          webContents?: Electron.WebContents;
          getBounds: () => Electron.Rectangle;
        };
        if (!v.webContents || v.webContents.isDestroyed()) continue;
        // Same rule as TabManager.canCapture: an uncommitted / auth-blocked view must not be captured.
        const g = globalThis as unknown as {
          __vela?: {
            ctx: {
              tabs: {
                canCapture: (wc: Electron.WebContents) => boolean;
                tabIdOf: (wc: Electron.WebContents) => string | undefined;
              };
            };
          };
        };
        const tabs = g.__vela?.ctx.tabs;
        if (tabs?.tabIdOf(v.webContents) && !tabs.canCapture(v.webContents)) continue;
        if (v.webContents.getURL() === '') continue;
        try {
          const img = await v.webContents.capturePage();
          out.push({ dataUrl: img.toDataURL(), bounds: v.getBounds() });
        } catch {
          /* view not paintable */
        }
      }
      return { width: width ?? 0, height: height ?? 0, layers: out };
    });
    const png = await shell.evaluate(async (input) => {
      const canvas = document.createElement('canvas');
      const dpr = window.devicePixelRatio || 1;
      canvas.width = input.width * dpr;
      canvas.height = input.height * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      ctx.scale(dpr, dpr);
      for (const layer of input.layers) {
        const img = new Image();
        img.src = layer.dataUrl;
        await new Promise<void>((r) => {
          img.onload = () => r();
          img.onerror = () => r();
        });
        ctx.drawImage(img, layer.bounds.x, layer.bounds.y, layer.bounds.width, layer.bounds.height);
      }
      return canvas.toDataURL('image/png').split(',')[1] ?? '';
    }, layers);
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    writeFileSync(join(SCREENSHOT_DIR, `${name}.png`), Buffer.from(png, 'base64'));
  };
  const close = async (): Promise<void> => {
    await app.close().catch(() => undefined);
    // Only a directory this launch created is removed; explicit ones belong to the test (relaunches).
    if (!opts.userData) rmSync(userData, { recursive: true, force: true });
  };
  return {
    app,
    shell,
    userData,
    fixtures: opts.fixtures,
    command,
    state,
    tabPage,
    overlay,
    overlayHidden,
    openTab,
    shot,
    close,
  };
}

export const test = base.extend<{ vela: VelaApp; fixtures: string }>({
  fixtures: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const { server, url } = await startFixtureServer();
      await use(url);
      server.close();
    },
    { scope: 'test' },
  ],
  vela: async ({ fixtures }, use) => {
    const v = await launchVela({ fixtures });
    await use(v);
    await v.close();
  },
});

export { expect };
