import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evalMain, expect, launchVela, test } from './helpers';

test.describe('downloads view', () => {
  test('replaces the sidebar, groups files by day, and Escape or Back brings the tabs back', async ({
    vela,
    fixtures,
  }) => {
    const id = await vela.openTab(`${fixtures}/page/Dl`);
    await vela.tabPage('/page/Dl');
    await evalMain(
      vela,
      `__vela.ctx.tabs.webContents(${JSON.stringify(id)}).downloadURL(${JSON.stringify(`${fixtures}/download/tool.sh`)})`,
    );
    await expect.poll(() => evalMain<number>(vela, 'return __vela.ctx.downloads.list().length')).toBe(1);

    await vela.shell.getByTestId('downloads-toggle').click();
    const view = vela.shell.getByTestId('downloads-view');
    await expect(view).toBeVisible();
    await expect(vela.shell.getByRole('tree')).toBeHidden();
    const row = view.getByTestId('download-item');
    await expect(row).toContainText('tool');
    await expect(row).toContainText('.sh');
    await vela.shot('80-downloads-view');

    await vela.shell.keyboard.press('Escape');
    await expect(view).toHaveCount(0);
    await expect(vela.shell.getByRole('tree')).toBeVisible();

    await vela.shell.getByTestId('downloads-toggle').click();
    await expect(view).toBeVisible();
    await view.getByTestId('downloads-back').click();
    await expect(view).toHaveCount(0);

    const list = await evalMain<{ path: string }[]>(vela, 'return __vela.ctx.downloads.list()');
    rmSync(list[0]?.path ?? '', { force: true });
  });

  test('shows a designed empty state', async ({ vela }) => {
    await vela.shell.getByTestId('downloads-toggle').click();
    await expect(vela.shell.getByTestId('downloads-empty')).toBeVisible();
    await vela.shot('81-downloads-empty');
  });
});

test.describe('extension bar', () => {
  test('pins a new extension as a tile under the URL field; the puzzle lists and unpins it', async ({
    vela,
  }) => {
    await expect(vela.shell.getByTestId('extension-bar')).toHaveCount(0);
    const dir = join(__dirname, 'fixtures', 'ext-marker');
    await evalMain(vela, `return __vela.ctx.extensions.load(${JSON.stringify(dir)})`);
    const bar = vela.shell.getByTestId('extension-bar');
    await expect(bar).toBeVisible();
    await expect(bar.getByTestId('extension-tile')).toHaveCount(1);
    const url = await vela.shell.getByTestId('url-pill').boundingBox();
    const barBox = await bar.boundingBox();
    expect((barBox?.y ?? 0) > (url?.y ?? 0)).toBe(true);
    await vela.shot('82-extension-bar');

    await bar.getByTestId('extensions-more').click();
    const menu = vela.shell.getByTestId('extensions-menu');
    await expect(menu).toContainText('Vela Marker');
    await vela.shot('83-extensions-menu');
    const pin = menu.getByTestId('extension-pin');
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await pin.click();
    await expect(pin).toHaveAttribute('aria-pressed', 'false');
    await expect(bar.getByTestId('extension-tile')).toHaveCount(0);
    expect(await evalMain<string[]>(vela, 'return __vela.ctx.prefs.value.extensionPins')).toEqual([]);
    await vela.shell.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });
});

test('after an Arc import, the Web Store extensions of Arc are offered for install', async ({ fixtures }) => {
  const root = mkdtempSync(join(tmpdir(), 'vela-import-'));
  const ext = join(
    root,
    'arc',
    'User Data',
    'Default',
    'Extensions',
    'eimadpbcbfnmbkopoojfekhnkhdbieeh',
    '4.9.0_0',
  );
  mkdirSync(ext, { recursive: true });
  writeFileSync(
    join(ext, 'manifest.json'),
    JSON.stringify({ name: 'Dark Reader', update_url: 'https://clients2.google.com/service/update2/crx' }),
  );
  writeFileSync(
    join(root, 'arc', 'StorableSidebar.json'),
    JSON.stringify({ version: 1, sidebar: { containers: [{ global: {} }, { spaces: [], items: [] }] } }),
  );
  const vela = await launchVela({ fixtures, env: { VELA_IMPORT_ROOT: root } });
  try {
    await evalMain(vela, "__vela.ctx.tabs.openUrl({ input: 'vela://settings/#import', noAtc: true })");
    const page = await vela.tabPage('vela://settings');
    await page.getByTestId('import-run-arc').click();
    const step = page.getByTestId('arc-extensions');
    await expect(step).toBeVisible();
    await expect(step).toContainText('Dark Reader');
    await expect(step.getByRole('checkbox')).toBeChecked();
    await expect(page.getByTestId('arc-extensions-install')).toContainText('1');
    await page.screenshot({
      path: join(__dirname, '..', 'e2e-artifacts', 'screenshots', '84-arc-extensions.png'),
    });
  } finally {
    await vela.close();
    rmSync(root, { recursive: true, force: true });
  }
});
