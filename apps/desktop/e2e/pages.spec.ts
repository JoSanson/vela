import { expect, test, type VelaApp } from './helpers';
import type { Page } from '@playwright/test';

async function evalMain<T>(vela: VelaApp, fn: string): Promise<T> {
  return vela.app.evaluate((_e, code) => {
    const g = globalThis as unknown as { __vela: unknown };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return (new Function('__vela', code) as (v: unknown) => T)(g.__vela);
  }, fn);
}

async function openUrl(vela: VelaApp, url: string): Promise<string> {
  return vela.app.evaluate((_e, u) => {
    const g = globalThis as unknown as {
      __vela: { ctx: { tabs: { openUrl: (r: { input: string; noAtc: boolean }) => string } } };
    };
    return g.__vela.ctx.tabs.openUrl({ input: u, noAtc: true });
  }, url);
}

async function openInternal(vela: VelaApp, name: string): Promise<Page> {
  await openUrl(vela, `vela://${name}`);
  const page = await vela.tabPage(`vela://${name}`);
  await expect(page.getByTestId(`page-${name}`)).toBeVisible();
  return page;
}

async function prefs(vela: VelaApp): Promise<Record<string, unknown>> {
  return evalMain(vela, 'return JSON.parse(JSON.stringify(__vela.ctx.prefs.value))');
}

async function tabCount(vela: VelaApp): Promise<number> {
  return Object.keys((await vela.state()).tabs).length;
}

test.describe('internal pages', () => {
  test('history lists visits grouped by day, opens, filters and deletes', async ({ vela, fixtures }) => {
    await openUrl(vela, `${fixtures}/page/Alpha`);
    await vela.tabPage('/page/Alpha');
    await openUrl(vela, `${fixtures}/page/Beta`);
    await vela.tabPage('/page/Beta');
    await expect.poll(() => tabCount(vela)).toBe(2);

    const page = await openInternal(vela, 'history');
    await expect(page.getByTestId('history-search')).toBeVisible();
    await expect.poll(() => page.getByTestId('history-row').count()).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId('history-list')).toContainText('Today');
    await vela.shot('40-history');

    await page.getByTestId('history-search').fill('Beta');
    await expect.poll(() => page.getByTestId('history-row').count()).toBe(1);
    await expect(page.getByTestId('history-row').first()).toContainText('Beta');

    const before = await tabCount(vela);
    await page.getByTestId('history-row').first().click();
    await expect.poll(() => tabCount(vela)).toBe(before + 1);

    // The visit opened in a new active tab: come back to History (a background page does not paint).
    await evalMain(
      vela,
      `const t = Object.values(__vela.ctx.store.state.tabs).find((x) => x.url.startsWith('vela://history'));
       __vela.ctx.store.dispatch({ type: 'tab/activate', id: t.id, now: Date.now() });`,
    );
    await page.getByTestId('history-search').fill('');
    await expect.poll(() => page.getByTestId('history-row').count()).toBeGreaterThanOrEqual(2);
    const rows = await page.getByTestId('history-row').count();
    await page.getByTestId('history-row').first().hover();
    await page.getByTestId('history-delete').first().click();
    await expect.poll(() => page.getByTestId('history-row').count()).toBe(rows - 1);

    await page.getByTestId('history-clear').click();
    await page.getByTestId('history-clear-yes').click();
    await expect(page.getByTestId('history-empty')).toBeVisible();
  });

  test('archive shows closed tabs with space badge and actions', async ({ vela, fixtures }) => {
    await openUrl(vela, `${fixtures}/page/Gone`);
    await vela.tabPage('/page/Gone');
    await expect.poll(() => tabCount(vela)).toBe(1);
    await vela.command('closeTab');
    await expect.poll(async () => (await vela.state()).archive.length).toBe(1);

    const page = await openInternal(vela, 'archive');
    await expect(page.getByTestId('archive-search')).toBeVisible();
    await expect(page.getByTestId('archive-row')).toHaveCount(1);
    await expect(page.getByTestId('archive-row').first()).toContainText('Gone');
    await expect(page.getByTestId('archive-row').first()).toContainText('Home');
    await page.getByTestId('archive-row').first().hover();
    await expect(page.getByTestId('archive-restore')).toBeVisible();
    await vela.shot('41-archive');

    await page.getByTestId('archive-search').fill('nothing-matches');
    await expect(page.getByTestId('archive-empty')).toBeVisible();
  });

  test('downloads page renders (empty state or live list)', async ({ vela }) => {
    const page = await openInternal(vela, 'downloads');
    await expect(
      page.getByTestId('downloads-empty').or(page.getByTestId('download-item')).first(),
    ).toBeVisible();
    await vela.shot('42-downloads');
  });

  test('settings: general controls persist prefs and sections route by hash', async ({ vela }) => {
    const page = await openInternal(vela, 'settings');
    await expect(page.getByTestId('settings-general')).toBeVisible();
    await expect(page.getByTestId('settings-search-engine')).toBeVisible();
    await vela.shot('43-settings-general');

    await page.getByTestId('settings-search-engine').selectOption('duckduckgo');
    await expect.poll(async () => (await prefs(vela)).searchEngineId).toBe('duckduckgo');
    await page.getByTestId('settings-auto-archive').selectOption('168');
    await expect.poll(async () => (await prefs(vela)).autoArchiveHours).toBe(168);
    const pipBefore = (await prefs(vela)).autoPip;
    await page.getByTestId('settings-auto-pip').click();
    await expect.poll(async () => (await prefs(vela)).autoPip).toBe(!pipBefore);
    await page.getByTestId('settings-memory-saver').click();
    await expect.poll(async () => (await prefs(vela)).memorySaverEnabled).toBe(false);

    await page.getByTestId('settings-nav-spaces').click();
    await expect(page.getByTestId('settings-spaces')).toBeVisible();
    await expect(page.getByTestId('settings-space-row')).toHaveCount(1);
    await vela.shot('44-settings-spaces');

    await page.getByTestId('settings-nav-atc').click();
    await expect(page.getByTestId('settings-atc')).toBeVisible();
    await page.getByTestId('atc-add').click();
    await page.getByTestId('atc-pattern').fill('*.github.com/*');
    await page.getByTestId('atc-test').fill('https://gist.github.com/x');
    await expect(page.getByTestId('atc-test-result')).toContainText('No rule');
    await vela.shot('45-settings-atc');

    await page.getByTestId('settings-nav-permissions').click();
    await expect(page.getByTestId('settings-permissions')).toBeVisible();
    await page.getByTestId('settings-nav-boosts').click();
    await expect(page.getByTestId('settings-boosts')).toBeVisible();
    await page.getByTestId('boost-host').fill('https://news.ycombinator.com/front');
    await page.getByTestId('boost-create').click();
    await expect(page.getByTestId('boost-editor')).toContainText('news.ycombinator.com');
    await vela.shot('46-settings-boosts');

    await page.getByTestId('settings-nav-import').click();
    await expect(page.getByTestId('settings-import')).toBeVisible();
    await expect(page.getByTestId('export-state')).toBeVisible();
    await vela.shot('47-settings-import');

    await page.getByTestId('settings-nav-about').click();
    await expect(page.getByTestId('settings-about')).toBeVisible();
    await expect(page.getByTestId('about-version')).not.toBeEmpty();
    await expect(page.getByTestId('update-check')).toBeVisible();
    await vela.shot('48-settings-about');
  });

  test('settings opens on a section from the hash and renders in dark mode', async ({ vela }) => {
    await evalMain(vela, "__vela.ctx.prefs.set({ theme: 'dark' })");
    await openUrl(vela, 'vela://settings/#atc');
    const page = await vela.tabPage('vela://settings');
    await expect(page.getByTestId('settings-atc')).toBeVisible();
    await expect(page.getByTestId('settings-nav-atc')).toHaveAttribute('aria-current', 'page');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.mode)).toBe('dark');
    await vela.shot('49-settings-dark');
  });

  test('shortcuts are grouped, platform-rendered and filterable', async ({ vela }) => {
    const page = await openInternal(vela, 'shortcuts');
    await expect(page.getByTestId('shortcuts-group-tabs')).toBeVisible();
    await expect(page.getByTestId('shortcuts-group-spaces')).toContainText('Go to space 1');
    const mod = process.platform === 'darwin' ? '⌘' : 'Ctrl';
    await expect(page.getByTestId('shortcuts-group-tabs').locator('kbd').first()).toHaveText(mod);
    await vela.shot('50-shortcuts');
    await page.getByTestId('shortcuts-search').fill('zoom');
    await expect(page.getByTestId('shortcut-row')).toHaveCount(3);
  });

  test('onboarding walks three steps and marks itself done', async ({ vela }) => {
    const page = await openInternal(vela, 'onboarding');
    await expect(page.getByTestId('onboarding-step-welcome')).toBeVisible();
    await vela.shot('51-onboarding');
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByTestId('onboarding-step-import')).toBeVisible();
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByTestId('onboarding-step-shortcuts')).toBeVisible();
    await page.getByTestId('onboarding-back').click();
    await expect(page.getByTestId('onboarding-step-import')).toBeVisible();
    await page.getByTestId('onboarding-skip').click();
    await page.getByTestId('onboarding-finish').click();
    await expect(page.getByTestId('onboarding-done')).toBeVisible();
    await expect.poll(async () => (await prefs(vela)).onboardingDone).toBe(true);
    await vela.shot('52-onboarding-done');
  });
});
