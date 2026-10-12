import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, launchVela, test } from './helpers';

test('content blocker blocks listed requests, counts them, and can be disabled per site', async ({
  fixtures,
}) => {
  const dir = mkdtempSync(join(tmpdir(), 'vela-filters-'));
  const filters = join(dir, 'filters.txt');
  writeFileSync(filters, '/ads/banner.png\n/tracker.js\n');
  const vela = await launchVela({ fixtures, env: { VELA_BLOCKER_FILTERS: filters } });
  try {
    await expect
      .poll(() =>
        vela.app.evaluate(
          () =>
            (globalThis as unknown as { __vela: { ctx: { blocker: { status: string } } } }).__vela.ctx.blocker
              .status,
        ),
      )
      .toBe('ready');
    const id = await vela.openTab(`${fixtures}/ads.html`);
    const page = await vela.tabPage('/ads.html');
    const adState = (): Promise<{ tracked: boolean; width: number } | null> =>
      page
        .evaluate(() => ({
          tracked: (window as unknown as { __tracked?: boolean }).__tracked ?? false,
          width: (document.getElementById('ad') as HTMLImageElement | null)?.naturalWidth ?? -1,
        }))
        .catch(() => null);
    await expect.poll(adState).toEqual({ tracked: false, width: 0 });
    const readStats = () =>
      vela.app.evaluate((_e, tabId) => {
        const g = globalThis as unknown as {
          __vela: {
            ctx: {
              tabs: { webContents: (i: string) => Electron.WebContents | undefined };
              blocker: {
                stats: (
                  u: string,
                  w: number | undefined,
                ) => { blockedOnTab: number; enabledForHost: boolean };
              };
            };
          };
        };
        const wc = g.__vela.ctx.tabs.webContents(tabId);
        return g.__vela.ctx.blocker.stats(wc?.getURL() ?? '', wc?.id);
      }, id);
    // Counters are bumped as each blocked request is reported, not when the page settles.
    await expect.poll(async () => (await readStats()).blockedOnTab).toBeGreaterThanOrEqual(2);
    expect((await readStats()).enabledForHost).toBe(true);

    await vela.app.evaluate(() => {
      const g = globalThis as unknown as {
        __vela: { ctx: { blocker: { setHostEnabled: (h: string, e: boolean) => void } } };
      };
      g.__vela.ctx.blocker.setHostEnabled('127.0.0.1', false);
    });
    await vela.command('reload');
    await expect.poll(adState).toEqual({ tracked: true, width: 10 });
  } finally {
    await vela.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reader mode extracts the article from a page', async ({ vela, fixtures }) => {
  const id = await vela.openTab(`${fixtures}/page/Article`);
  await vela.tabPage('/page/Article');
  const result = await vela.app.evaluate(async (_e, tabId) => {
    const g = globalThis as unknown as {
      __vela: {
        reader: {
          extractReadable: (
            wc: Electron.WebContents,
          ) => Promise<{ title: string; content: string; length: number } | null>;
        };
        ctx: { tabs: { webContents: (i: string) => Electron.WebContents | undefined } };
      };
    };
    const wc = g.__vela.ctx.tabs.webContents(tabId);
    return wc ? g.__vela.reader.extractReadable(wc) : null;
  }, id);
  expect(result?.title).toBe('Article');
  expect(result?.content).toContain('lorem ipsum');
  expect(result?.length ?? 0).toBeGreaterThan(1000);
});
