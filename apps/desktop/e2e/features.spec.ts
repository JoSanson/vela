import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpsServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { expect, launchVela, test, type VelaApp } from './helpers';

const sidebarTab = (vela: VelaApp, id: string) => vela.shell.locator(`[data-tab-id="${id}"]`);

async function evalMain<T>(vela: VelaApp, fn: string): Promise<T> {
  return vela.app.evaluate((_e, code) => {
    const g = globalThis as unknown as { __vela: unknown };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return (new Function('__vela', code) as (v: unknown) => T)(g.__vela);
  }, fn);
}

test.describe('favicons', () => {
  test('favicons are cached and served from vela://favicon', async ({ vela, fixtures }) => {
    const id = await vela.openTab(`${fixtures}/page/Icon`);
    await expect.poll(async () => (await vela.state()).tabs[id]?.url).toContain('Icon');
    await expect.poll(async () => (await vela.state()).tabs[id]?.favicon ?? '').toContain('vela://favicon/');
    const img = sidebarTab(vela, id).locator('img');
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  });
});

test.describe('downloads', () => {
  test('tracks a download with progress, shows it in the panel and completes', async ({ vela, fixtures }) => {
    const id = await vela.openTab(`${fixtures}/page/Dl`);
    await vela.tabPage('/page/Dl');
    await evalMain(
      vela,
      `__vela.ctx.tabs.webContents(${JSON.stringify(id)}).downloadURL(${JSON.stringify(`${fixtures}/download/blob.bin`)})`,
    );
    await vela.shell.getByTestId('downloads-toggle').click();
    const panel = vela.shell.getByTestId('downloads-panel');
    await expect(panel).toBeVisible();
    const item = panel.getByTestId('download-item');
    await expect(item).toHaveCount(1);
    await expect(item).toHaveAttribute('data-state', 'completed');
    await expect(item).toContainText('blob.bin');
    await vela.shot('30-downloads');
    const list = await evalMain<{ path: string; receivedBytes: number }[]>(
      vela,
      'return __vela.ctx.downloads.list()',
    );
    expect(list[0]?.receivedBytes).toBe(2 * 1024 * 1024);
    expect(readFileSync(list[0]?.path ?? '').length).toBe(2 * 1024 * 1024);
    rmSync(list[0]?.path ?? '', { force: true });
  });
});

test.describe('permissions', () => {
  test('prompts once, remembers the decision and lists it', async ({ vela, fixtures }) => {
    await vela.openTab(`${fixtures}/page/Perm`);
    const page = await vela.tabPage('/page/Perm');
    const req = page.evaluate(() => Notification.requestPermission());
    const overlay = await vela.overlay();
    await expect(overlay.getByTestId('permission-prompt')).toBeVisible();
    await expect(overlay.getByTestId('permission-prompt')).toContainText('notifications');
    await vela.shot('31-permission-prompt');
    await overlay.getByTestId('permission-allow').click();
    expect(await req).toBe('granted');
    await vela.overlayHidden();
    expect(await page.evaluate(() => Notification.permission)).toBe('granted');
    const list = await evalMain<{ origin: string; permission: string; decision: string }[]>(
      vela,
      'return __vela.ctx.permissions.list()',
    );
    expect(list).toEqual([expect.objectContaining({ permission: 'notifications', decision: 'allow' })]);
    // second request is answered from storage without a prompt
    expect(await page.evaluate(() => Notification.requestPermission())).toBe('granted');
    await expect(overlay.getByTestId('permission-prompt')).toHaveCount(0);
  });

  test('geolocation is denied when the user blocks', async ({ vela, fixtures }) => {
    await vela.openTab(`${fixtures}/page/Geo`);
    const page = await vela.tabPage('/page/Geo');
    const result = page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve('ok'),
            (err) => resolve(`denied:${err.code}`),
            { timeout: 8000 },
          );
        }),
    );
    const overlay = await vela.overlay();
    await expect(overlay.getByTestId('permission-prompt')).toBeVisible();
    await overlay.getByTestId('permission-deny').click();
    expect(await result).toMatch(/^denied/);
  });
});

test.describe('memory saver', () => {
  test('a sleeping tab frees its WebContents and restores url + scroll on wake', async ({
    vela,
    fixtures,
  }) => {
    const a = await vela.openTab(`${fixtures}/page/Sleepy`);
    const page = await vela.tabPage('/page/Sleepy');
    await page.evaluate(() => window.scrollTo(0, 120));
    await vela.openTab(`${fixtures}/page/Other`);
    await evalMain(vela, `return __vela.ctx.tabs.sleep(${JSON.stringify(a)})`);
    await expect.poll(async () => (await vela.state()).tabs[a]?.sleeping).toBe(true);
    expect(
      await evalMain<boolean>(vela, `return __vela.ctx.tabs.webContents(${JSON.stringify(a)}) === undefined`),
    ).toBe(true);
    await expect(sidebarTab(vela, a)).toHaveClass(/sleeping/);
    await vela.shot('32-sleeping-tab');
    await sidebarTab(vela, a).click();
    await expect.poll(async () => (await vela.state()).tabs[a]?.sleeping).toBe(false);
    const woken = await vela.tabPage('/page/Sleepy');
    await expect.poll(() => woken.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  });

  test('the sweeper sleeps idle background tabs but never the visible, audible or always-active ones', async ({
    vela,
    fixtures,
  }) => {
    const a = await vela.openTab(`${fixtures}/page/Idle`);
    const b = await vela.openTab(`${fixtures}/page/Keep`);
    const c = await vela.openTab(`${fixtures}/page/Front`);
    await evalMain(
      vela,
      `__vela.ctx.store.dispatch({ type: 'tab/update', id: ${JSON.stringify(b)}, patch: { alwaysActive: true } });
       const old = Date.now() - 60 * 60_000;
       for (const id of [${JSON.stringify(a)}, ${JSON.stringify(b)}, ${JSON.stringify(c)}]) __vela.ctx.store.dispatch({ type: 'tab/update', id, patch: { lastActiveAt: old } });`,
    );
    await evalMain(vela, '__vela.ctx.prefs.set({ memorySaverMinutes: 1 })');
    // The sweeper skips tabs that are still loading, so poll it like the 30 s timer would.
    await expect
      .poll(async () => {
        await evalMain(vela, '__vela.sweep()');
        return (await vela.state()).tabs[a]?.sleeping;
      })
      .toBe(true);
    const st = await vela.state();
    expect(st.tabs[b]?.sleeping).toBe(false);
    expect(st.tabs[c]?.sleeping).toBe(false);
  });

  test('auto-archive moves stale Today tabs to the archive', async ({ vela, fixtures }) => {
    const a = await vela.openTab(`${fixtures}/page/Stale`);
    await vela.openTab(`${fixtures}/page/Fresh`);
    await evalMain(
      vela,
      `__vela.ctx.store.dispatch({ type: 'tab/update', id: ${JSON.stringify(a)}, patch: { lastActiveAt: Date.now() - 48 * 3_600_000 } });
       __vela.ctx.store.dispatch({ type: 'maintenance/autoArchive', now: Date.now(), maxAgeMs: 24 * 3_600_000 });`,
    );
    const st = await vela.state();
    expect(st.tabs[a]).toBeUndefined();
    expect(st.archive[0]?.reason).toBe('auto');
  });
});

test.describe('auto picture-in-picture', () => {
  test('a playing video pops out when the tab is hidden and comes back when shown', async ({
    vela,
    fixtures,
  }) => {
    const v = await vela.openTab(`${fixtures}/video.html`);
    const page = await vela.tabPage('/video.html');
    await expect.poll(() => page.evaluate(() => !document.querySelector('video')?.paused)).toBe(true);
    await vela.openTab(`${fixtures}/page/Away`);
    await expect
      .poll(() => page.evaluate(() => !!document.pictureInPictureElement), { timeout: 8000 })
      .toBe(true);
    await sidebarTab(vela, v).click();
    await expect.poll(() => page.evaluate(() => !!document.pictureInPictureElement)).toBe(false);
  });
});

test.describe('boosts', () => {
  test('per-host CSS is injected and Zap hides the picked element permanently', async ({
    vela,
    fixtures,
  }) => {
    const id = await vela.openTab(`${fixtures}/page/Boosted`);
    const page = await vela.tabPage('/page/Boosted');
    const host = new URL(fixtures).hostname;
    await evalMain(
      vela,
      `__vela.ctx.boosts.save({ id: 'b1', host: ${JSON.stringify(host)}, enabled: true, css: 'h1 { color: rgb(255, 0, 0) !important; }', js: 'document.title = "boosted"', zapped: [], font: null, updatedAt: 0 });`,
    );
    await vela.command('reload');
    await expect
      .poll(() =>
        page
          .evaluate(() => {
            const h1 = document.querySelector('h1');
            return h1 ? getComputedStyle(h1).color : '';
          })
          .catch(() => ''),
      )
      .toBe('rgb(255, 0, 0)');
    await expect.poll(() => page.title().catch(() => '')).toBe('boosted');

    const zapping = evalMain<string | null>(
      vela,
      `return __vela.ctx.boosts.zap(__vela.ctx.tabs.webContents(${JSON.stringify(id)}))`,
    );
    await page.waitForFunction(() => !!document.getElementById('__vela-zap'));
    const link = page.locator('#link');
    await link.hover();
    await link.click({ force: true });
    const selector = await zapping;
    expect(selector).toBe('#link');
    await expect(link).toBeHidden();
    await vela.command('reload');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#link')).toBeHidden();
    const boosts = await evalMain<{ zapped: string[] }[]>(vela, 'return __vela.ctx.boosts.list()');
    expect(boosts[0]?.zapped).toEqual(['#link']);
    const json = await evalMain<string>(vela, 'return __vela.ctx.boosts.exportJson()');
    expect((JSON.parse(json) as { boosts: unknown[] }).boosts).toHaveLength(1);
  });
});

test.describe('import & export', () => {
  test('imports bookmarks and history from a Chrome profile', async ({ fixtures }) => {
    const root = mkdtempSync(join(tmpdir(), 'vela-chrome-'));
    const profile = join(root, 'chrome', 'Default');
    mkdirSync(profile, { recursive: true });
    writeFileSync(
      join(profile, 'Bookmarks'),
      JSON.stringify({
        roots: {
          bookmark_bar: {
            type: 'folder',
            name: 'Bookmarks bar',
            children: [
              { type: 'url', name: 'Docs', url: `${fixtures}/page/Docs` },
              {
                type: 'folder',
                name: 'Work',
                children: [{ type: 'url', name: 'Mail', url: `${fixtures}/page/Mail` }],
              },
            ],
          },
          other: { type: 'folder', name: 'Other', children: [] },
        },
      }),
    );
    const db = new Database(join(profile, 'History'));
    db.exec(
      'CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT, visit_count INTEGER, typed_count INTEGER, last_visit_time INTEGER, hidden INTEGER DEFAULT 0)',
    );
    const chromeTime = (Date.now() + 11644473600000) * 1000;
    db.prepare(
      'INSERT INTO urls (url, title, visit_count, typed_count, last_visit_time) VALUES (?, ?, ?, ?, ?)',
    ).run('https://example.com/a', 'A', 3, 0, chromeTime);
    db.prepare(
      'INSERT INTO urls (url, title, visit_count, typed_count, last_visit_time) VALUES (?, ?, ?, ?, ?)',
    ).run('https://example.com/b', 'B', 1, 0, chromeTime - 1000);
    db.close();
    const vela = await launchVela({ fixtures, env: { VELA_IMPORT_ROOT: root } });
    try {
      const sources = await evalMain<{ id: string; available: boolean }[]>(
        vela,
        'return __vela.importer.detectSources()',
      );
      expect(sources.find((s) => s.id === 'chrome')?.available).toBe(true);
      const result = await evalMain<{ bookmarks: number; history: number }>(
        vela,
        "return __vela.importer.runImport('chrome', true, true)",
      );
      expect(result).toEqual({ bookmarks: 2, history: 2 });
      const st = await vela.state();
      const folders = Object.values(st.folders);
      expect(folders.map((f) => f.name).sort()).toEqual(['Bookmarks bar', 'Work']);
      const work = folders.find((f) => f.name === 'Work');
      expect(work?.children.map((c) => st.tabs[c]?.url)).toEqual([`${fixtures}/page/Mail`]);
      expect(Object.values(st.tabs).every((t) => t.kind === 'pinned')).toBe(true);
      const history = await vela.app.evaluate(() => {
        const g = globalThis as unknown as {
          __vela: { ctx: { history: { search: (q: string) => { url: string }[] } } };
        };
        return g.__vela.ctx.history.search('example.com');
      });
      expect(history.map((h) => h.url).sort()).toEqual(['https://example.com/a', 'https://example.com/b']);
      await expect(vela.shell.locator('[data-dnd-type="folder"]')).toHaveCount(2);
      await vela.shot('33-import');
    } finally {
      await vela.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('export → import round-trips the whole state', async ({ vela, fixtures }) => {
    const a = await vela.openTab(`${fixtures}/page/Exported`);
    await vela.command('pinTab');
    await expect.poll(async () => (await vela.state()).tabs[a]?.kind).toBe('pinned');
    const json = await evalMain<string>(vela, 'return __vela.exporter.exportState(__vela.ctx)');
    const bundle = JSON.parse(json) as { format: string; state: { tabs: Record<string, unknown> } };
    expect(bundle.format).toBe('vela-export');
    expect(Object.keys(bundle.state.tabs)).toEqual([a]);
    await vela.command('closeTab');
    await evalMain(
      vela,
      `__vela.ctx.store.dispatch({ type: 'tab/close', id: ${JSON.stringify(a)}, now: Date.now() })`,
    );
    await expect.poll(async () => Object.keys((await vela.state()).tabs).length).toBe(0);
    await evalMain(vela, `__vela.exporter.importState(__vela.ctx, ${JSON.stringify(json)})`);
    await expect.poll(async () => Object.keys((await vela.state()).tabs)).toEqual([a]);
    await expect(sidebarTab(vela, a)).toBeVisible();
  });
});

test.describe('certificate errors', () => {
  test('shows an interstitial for a self-signed certificate and lets the user proceed', async ({ vela }) => {
    const dir = mkdtempSync(join(tmpdir(), 'vela-cert-'));
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        join(dir, 'k.pem'),
        '-out',
        join(dir, 'c.pem'),
        '-subj',
        '/CN=localhost',
        '-days',
        '1',
      ],
      { stdio: 'ignore' },
    );
    const server = createHttpsServer(
      { key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) },
      (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<title>Secure</title><h1 id="secure">secure page</h1>');
      },
    );
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `https://localhost:${(server.address() as AddressInfo).port}/`;
    try {
      await evalMain(vela, `__vela.ctx.tabs.openUrl({ input: ${JSON.stringify(url)}, noAtc: true })`);
      const page = await vela.tabPage('vela://error');
      await expect(page.getByTestId('error-cert')).toBeVisible();
      await expect(page.getByTestId('error-cert')).toContainText('localhost');
      await vela.shot('34-certificate-interstitial');
      await page.getByTestId('cert-proceed').click();
      const secure = await vela.tabPage('https://localhost');
      await expect(secure.locator('#secure')).toHaveText('secure page');
    } finally {
      server.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe('profiles', () => {
  test('spaces attached to different profiles do not share cookies', async ({ vela, fixtures }) => {
    await vela.openTab(`${fixtures}/page/CookieA`);
    const a = await vela.tabPage('/page/CookieA');
    await a.evaluate(() => {
      document.cookie = 'vela_profile=alpha; path=/';
    });
    await evalMain(
      vela,
      `const { createProfile, createSpace } = __vela.core;
       const p = createProfile('Work', '#ff0000', 'p-work');
       __vela.ctx.store.dispatch({ type: 'profile/create', profile: p });
       const s = createSpace({ id: 's-work', name: 'Work', profileId: p.id });
       __vela.ctx.store.dispatch({ type: 'space/create', space: s });
       __vela.ctx.store.dispatch({ type: 'space/activate', id: s.id, now: Date.now() });
       __vela.ctx.tabs.openUrl({ input: ${JSON.stringify(`${fixtures}/page/CookieB`)}, spaceId: s.id, noAtc: true });`,
    );
    const b = await vela.tabPage('/page/CookieB');
    expect(await b.evaluate(() => document.cookie)).toBe('');
    const partitions = await evalMain<string[]>(vela, 'return __vela.ctx.sessions.allPartitions()');
    expect(partitions.sort()).toEqual(['persist:default', 'persist:profile-p-work']);
  });
});

test.describe('review fixes', () => {
  test('window.open popups keep their opener (OAuth-style flows) in a child window', async ({
    vela,
    fixtures,
  }) => {
    await vela.openTab(`${fixtures}/page/Opener`);
    const page = await vela.tabPage('/page/Opener');
    const result = await page.evaluate((base) => {
      const w = window.open(`${base}/page/Popup`, 'popup', 'width=400,height=400');
      return { hasWindow: !!w, opener: !!w && w.opener === window };
    }, fixtures);
    expect(result.hasWindow).toBe(true);
    const popup = await vela.tabPage('/page/Popup');
    await expect.poll(() => popup.evaluate(() => !!window.opener).catch(() => false)).toBe(true);
    expect(result.opener).toBe(true);
    // Popups are real child windows (Chrome-like); plain links still become tabs.
    await expect
      .poll(() => vela.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), {
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(2);
    expect(Object.values((await vela.state()).tabs).length).toBe(1);
    await popup.close().catch(() => undefined);
  });

  test('a subresource with a bad certificate does not replace the page', async ({ vela, fixtures }) => {
    await vela.openTab(`${fixtures}/page/Subres`);
    const page = await vela.tabPage('/page/Subres');
    await page.evaluate(() => {
      const img = document.createElement('img');
      img.src = 'https://self-signed.badssl.invalid/x.png';
      document.body.appendChild(img);
    });
    await new Promise((r) => setTimeout(r, 800));
    expect(page.url()).toContain('/page/Subres');
  });

  test('unreserved shortcuts reach Vela only when the page lets them through', async ({ vela, fixtures }) => {
    await vela.openTab(`${fixtures}/page/Keys`);
    const page = await vela.tabPage('/page/Keys');
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${mod}+S`);
    await expect
      .poll(() =>
        vela.app.evaluate(() => {
          const g = globalThis as unknown as {
            __vela: { ctx: { windows: { main: { layout: { sidebarVisible: boolean } } } } };
          };
          return g.__vela.ctx.windows.main.layout.sidebarVisible;
        }),
      )
      .toBe(false);
    await page.evaluate(() => window.addEventListener('keydown', (e) => e.preventDefault()));
    await page.keyboard.press(`${mod}+S`);
    await new Promise((r) => setTimeout(r, 500));
    const stillHidden = await vela.app.evaluate(() => {
      const g = globalThis as unknown as {
        __vela: { ctx: { windows: { main: { layout: { sidebarVisible: boolean } } } } };
      };
      return !g.__vela.ctx.windows.main.layout.sidebarVisible;
    });
    expect(stillHidden).toBe(true);
  });

  test('the second profile session gets the content blocker too', async ({ vela, fixtures }) => {
    await evalMain(
      vela,
      `const { createProfile, createSpace } = __vela.core;
       const p = createProfile('Blocked', '#ff0000', 'p-blocked');
       __vela.ctx.store.dispatch({ type: 'profile/create', profile: p });
       const s = createSpace({ id: 's-blocked', name: 'Blocked', profileId: p.id });
       __vela.ctx.store.dispatch({ type: 'space/create', space: s });
       __vela.ctx.store.dispatch({ type: 'space/activate', id: s.id, now: Date.now() });
       __vela.ctx.tabs.openUrl({ input: ${JSON.stringify(`${fixtures}/page/ProfileTab`)}, spaceId: s.id, noAtc: true });`,
    );
    const page = await vela.tabPage('/page/ProfileTab');
    await expect(page.getByTestId('heading')).toHaveText('ProfileTab');
    const wired = await evalMain<boolean>(
      vela,
      'return __vela.ctx.blocker.engine !== null && __vela.ctx.sessions.allPartitions().length === 2',
    );
    expect(wired).toBe(true);
  });
});
