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
    if (p === '/download/blob.bin') {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="blob.bin"',
        'Content-Length': String(2 * 1024 * 1024),
      });
      res.end(Buffer.alloc(2 * 1024 * 1024, 7));
      return;
    }
    if (p === '/slow') {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<title>Slow page</title><h1>slow</h1>');
      }, 1500);
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
      activeTabId: string | null;
      today: string[];
      pinned: string[];
      split: { panes: string[] } | null;
    }
  >;
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
    }
  >;
  folders: Record<string, { id: string; name: string; children: string[]; collapsed: boolean }>;
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
  const overlayHidden = async (): Promise<void> => {
    await expect
      .poll(() =>
        app.evaluate(() => {
          const g = globalThis as unknown as { __vela: { ctx: { overlay: { visible: boolean } } } };
          return g.__vela.ctx.overlay.visible;
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
    rmSync(userData, { recursive: true, force: true });
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
