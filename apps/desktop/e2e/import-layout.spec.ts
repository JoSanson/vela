import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCREENSHOT_DIR, expect, launchVela, test } from './helpers';

test('import rows keep their layout in French with Arc, Chrome and a denied Safari', async ({ fixtures }) => {
  test.skip(process.platform !== 'darwin', 'Safari and its Full Disk Access gate exist on macOS only');
  const root = mkdtempSync(join(tmpdir(), 'vela-import-'));
  mkdirSync(join(root, 'arc'), { recursive: true });
  mkdirSync(join(root, 'chrome', 'Default'), { recursive: true });
  mkdirSync(join(root, 'safari'), { recursive: true });
  writeFileSync(
    join(root, 'arc', 'StorableSidebar.json'),
    JSON.stringify({ version: 1, sidebar: { containers: [{ global: {} }, { spaces: [], items: [] }] } }),
  );
  writeFileSync(
    join(root, 'chrome', 'Default', 'Bookmarks'),
    JSON.stringify({ roots: { bookmark_bar: { children: [], name: 'Bar', type: 'folder' } } }),
  );
  writeFileSync(join(root, 'safari', 'Bookmarks.plist'), '');
  chmodSync(join(root, 'safari', 'Bookmarks.plist'), 0o000);
  const vela = await launchVela({
    fixtures,
    env: { VELA_IMPORT_ROOT: root, VELA_LOCALE: 'fr-FR' },
  });
  try {
    await vela.app.evaluate((_e, u) => {
      const g = globalThis as unknown as {
        __vela: { ctx: { tabs: { openUrl: (r: { input: string; noAtc: boolean }) => string } } };
      };
      return g.__vela.ctx.tabs.openUrl({ input: u, noAtc: true });
    }, 'vela://onboarding');
    const page = await vela.tabPage('vela://onboarding');
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByTestId('onboarding-step-import')).toBeVisible();
    const arc = page.getByTestId('import-source-arc');
    await expect(arc).toBeVisible();
    const nameBox = await arc.locator('> span').nth(1).boundingBox();
    expect(nameBox?.width ?? 0).toBeGreaterThan(150);
    await expect(page.getByTestId('import-source-safari')).toContainText('Accès complet au disque requis');
    await page.screenshot({ path: join(SCREENSHOT_DIR, '35-import-onboarding-fr.png') });
  } finally {
    await vela.close();
    rmSync(root, { recursive: true, force: true });
  }
});
