import { expect, test } from './helpers';

test.describe('localization', () => {
  test('the language setting switches menus, settings and the shell live', async ({ vela }) => {
    await vela.openTab('vela://settings');
    const settings = await vela.tabPage('vela://settings');
    const select = settings.getByTestId('settings-language');
    await expect(select).toHaveValue('system');
    await expect(settings.locator('html')).toHaveAttribute('lang', 'en');

    await select.selectOption('fr');
    await expect(settings.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(settings.getByText('Langue', { exact: true })).toBeVisible();
    await expect(vela.shell.locator('html')).toHaveAttribute('lang', 'fr');
    await expect
      .poll(() => vela.app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((i) => i.label) ?? []))
      .toContain('Fichier');
    await vela.shot('90-settings-french');

    await select.selectOption('en');
    await expect(settings.locator('html')).toHaveAttribute('lang', 'en');
    await expect(settings.getByText('Language', { exact: true })).toBeVisible();
    await expect
      .poll(() => vela.app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((i) => i.label) ?? []))
      .toContain('File');
  });

  test('System follows the OS language', async ({ fixtures }) => {
    const { launchVela } = await import('./helpers');
    const vela = await launchVela({ fixtures, env: { VELA_LOCALE: 'fr-FR' } });
    try {
      await expect(vela.shell.locator('html')).toHaveAttribute('lang', 'fr');
      await vela.openTab('vela://settings');
      const settings = await vela.tabPage('vela://settings');
      await expect(settings.getByTestId('settings-language')).toHaveValue('system');
      await expect(settings.getByText('Langue', { exact: true })).toBeVisible();
    } finally {
      await vela.close();
    }
  });
});
