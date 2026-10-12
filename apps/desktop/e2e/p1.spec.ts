import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evalMain, expect, test } from './helpers';

const ICON = join(__dirname, '..', 'resources', 'icon.png');

test.describe('site control center', () => {
  test('shows blocker state, zoom and per-site permissions and acts on them', async ({ vela, fixtures }) => {
    const id = await vela.openTab(`${fixtures}/page/Site`);
    await vela.tabPage('/page/Site');
    await evalMain(
      vela,
      `__vela.ctx.permissions.set({ origin: ${JSON.stringify(new URL(fixtures).origin)}, permission: 'notifications', decision: 'allow', updatedAt: Date.now() })`,
    );
    await vela.shell.getByTestId('site-control-button').click();
    const panel = vela.shell.getByTestId('site-control');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Not secure');
    await expect(panel.getByTestId('site-permission')).toContainText('notifications');
    await vela.shot('60-site-control');

    await expect(panel.getByTestId('site-zoom')).toHaveText('100%');
    await panel.getByRole('button', { name: 'Zoom in' }).click();
    await expect(panel.getByTestId('site-zoom')).toHaveText('110%');
    await expect.poll(async () => (await vela.state()).tabs[id]?.zoom).toBeCloseTo(1.1, 2);

    await panel.getByTestId('site-blocker-toggle').click();
    await expect
      .poll(async () => {
        const st = await evalMain<{ enabledForHost: boolean }>(
          vela,
          `return __vela.ctx.blocker.stats(${JSON.stringify(fixtures)}, undefined)`,
        );
        return st.enabledForHost;
      })
      .toBe(false);
    await vela.shell.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });
});

test.describe('themes', () => {
  test('extracts a two-colour palette from an image', async ({ vela }) => {
    const palette = await evalMain<{ from: string; to: string } | null>(
      vela,
      `return __vela.theme.paletteFromFile(${JSON.stringify(ICON)})`,
    );
    expect(palette).not.toBeNull();
    expect(palette?.from).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette?.to).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette?.from).not.toBe(palette?.to);
  });

  test('glass mode toggles window vibrancy without breaking the shell', async ({ vela, fixtures }) => {
    await vela.openTab(`${fixtures}/page/Glass`);
    await evalMain(vela, '__vela.ctx.prefs.set({ glass: true })');
    await expect.poll(() => vela.shell.evaluate(() => document.documentElement.dataset.glass)).toBe('true');
    await vela.shot('61-glass');
    await evalMain(vela, '__vela.ctx.prefs.set({ glass: false })');
    await expect.poll(() => vela.shell.evaluate(() => document.documentElement.dataset.glass)).toBe('false');
  });
});

test.describe('reader mode', () => {
  test('opens the article in a reader peek', async ({ vela, fixtures }) => {
    await vela.openTab(`${fixtures}/page/Readable`);
    await vela.tabPage('/page/Readable');
    await vela.command('readerMode');
    const reader = await vela.tabPage('vela://reader');
    await expect(reader.getByTestId('page-reader')).toBeVisible();
    await expect(reader.getByTestId('reader-body')).toContainText('lorem ipsum');
    await expect(reader.locator('h1')).toContainText('Readable');
    await vela.shot('62-reader');
    const overlay = await vela.overlay();
    await expect(overlay.getByTestId('peek-toolbar')).toBeVisible();
    await overlay.getByTestId('peek-close').click();
    await vela.overlayHidden();
  });
});

const CACHE = join(tmpdir(), 'vela-ext-cache');
const EXTENSIONS = [
  {
    key: 'darkreader',
    url: 'https://github.com/darkreader/darkreader/releases/download/v4.9.133/darkreader-chrome-mv3.zip',
    name: 'Dark Reader',
  },
  {
    key: 'ubol',
    url: 'https://github.com/uBlockOrigin/uBOL-home/releases/download/2026.1006.1931/uBOLite_2026.1006.1931.chromium.zip',
    name: 'uBlock Origin Lite',
  },
];

function fetchExtension(key: string, url: string): string | null {
  const dir = join(CACHE, key);
  if (existsSync(join(dir, 'manifest.json'))) return dir;
  try {
    mkdirSync(dir, { recursive: true });
    const zip = join(CACHE, `${key}.zip`);
    execFileSync('curl', ['-fsSL', '--retry', '2', '-o', zip, url], { stdio: 'ignore', timeout: 120_000 });
    execFileSync('unzip', ['-oq', zip, '-d', dir], { stdio: 'ignore' });
    return existsSync(join(dir, 'manifest.json')) ? dir : null;
  } catch {
    return null;
  }
}

test.describe('extensions', () => {
  test('a local MV3 extension runs its content script, service worker, storage and popup', async ({
    vela,
    fixtures,
  }) => {
    const dir = join(__dirname, 'fixtures', 'ext-marker');
    const info = await evalMain<{ name: string } | null>(
      vela,
      `return __vela.ctx.extensions.load(${JSON.stringify(dir)})`,
    );
    expect(info?.name).toBe('Vela Marker');
    await vela.openTab(`${fixtures}/page/Marked`);
    const page = await vela.tabPage('/page/Marked');
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.getAttribute('data-vela-marker')).catch(() => null),
      )
      .toBe('content-script');
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.getAttribute('data-vela-marker-sw')).catch(() => null),
      )
      .toBe('2');
    const list = await evalMain<{ id: string; name: string }[]>(vela, 'return __vela.ctx.extensions.list()');
    const id = list.find((x) => x.name === 'Vela Marker')?.id ?? '';
    expect(
      await evalMain<string | null>(vela, `return __vela.ctx.extensions.popupUrl(${JSON.stringify(id)})`),
    ).toBe(`chrome-extension://${id}/popup.html`);
    await evalMain(vela, `__vela.ctx.peek.open(__vela.ctx.extensions.popupUrl(${JSON.stringify(id)}))`);
    const popup = await vela.tabPage('chrome-extension://');
    await expect(popup.locator('#popup')).toHaveText('Vela Marker popup');
    await vela.shot('63-extension-popup');
    await evalMain(vela, '__vela.ctx.peek.close()');
  });

  test('loads Dark Reader and uBlock Origin Lite (popular MV3 releases) and reports their status', async ({
    vela,
  }) => {
    const dirs = EXTENSIONS.map((e) => ({ ...e, dir: fetchExtension(e.key, e.url) }));
    test.skip(
      dirs.some((d) => !d.dir),
      'extension release download unavailable (offline?)',
    );
    for (const d of dirs) {
      const info = await evalMain<{ name: string; version: string } | null>(
        vela,
        `return __vela.ctx.extensions.load(${JSON.stringify(d.dir)})`,
      );
      expect(info?.name, d.key).toBe(d.name);
      expect(info?.version).toMatch(/\d/);
    }
    const list = await evalMain<{ id: string; name: string }[]>(vela, 'return __vela.ctx.extensions.list()');
    expect(list.map((x) => x.name).sort()).toEqual(['Dark Reader', 'uBlock Origin Lite']);
    for (const name of ['Dark Reader', 'uBlock Origin Lite']) {
      const popup = await evalMain<string | null>(
        vela,
        `return __vela.ctx.extensions.popupUrl(${JSON.stringify(list.find((x) => x.name === name)?.id ?? '')})`,
      );
      expect(popup, name).toMatch(/^chrome-extension:\/\/[a-z]+\/.+\.html$/);
    }
    // Dark Reader's service worker is started by Chromium (its chrome.permissions use comes from the
    // extension API layer, see docs/EXTENSIONS.md).
    await expect
      .poll(() =>
        vela.app.evaluate(({ session }) =>
          Object.values(session.fromPartition('persist:default').serviceWorkers.getAllRunning()).map(
            (w) => w.scriptUrl,
          ),
        ),
      )
      .toContainEqual(expect.stringContaining('/background/index.js'));
    await evalMain(vela, "__vela.ctx.tabs.openUrl({ input: 'vela://settings/#extensions', noAtc: true })");
    const settings = await vela.tabPage('vela://settings');
    await expect(settings.getByTestId('extension-row')).toHaveCount(2);
    await vela.shot('64-extensions-settings');
    const remaining = await evalMain<string[]>(
      vela,
      `__vela.ctx.extensions.remove(${JSON.stringify(list[0]?.id ?? '')}); return __vela.ctx.extensions.list().map((x) => x.name)`,
    );
    expect(remaining).toHaveLength(1);
  });
});
