import { expect, test } from './helpers';

test.describe('skeleton', () => {
  test('window opens with sidebar, opens a tab via the command bar and navigates', async ({
    vela,
    fixtures,
  }) => {
    const { shell } = vela;
    await expect(shell.getByTestId('sidebar')).toBeVisible();
    await expect(shell.getByTestId('new-tab')).toBeVisible();
    await vela.shot('01-empty');

    await vela.command('newTab');
    const overlay = await vela.overlay();
    const input = overlay.getByTestId('command-input');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await input.fill(`${fixtures}/page/Alpha`);
    await vela.shot('02-command-bar');
    await input.press('Enter');

    await expect.poll(async () => Object.values((await vela.state()).tabs).length).toBe(1);
    const page = await vela.tabPage('/page/Alpha');
    await expect(page.getByTestId('heading')).toHaveText('Alpha');
    await expect(shell.locator('[data-tab-id]').first()).toContainText('Alpha');
    await expect(shell.getByTestId('url-pill')).toContainText('127.0.0.1');
    await vela.shot('03-tab-open');

    await page.click('#link');
    await expect(page.getByTestId('heading')).toHaveText('Alpha-next');
    await expect(shell.locator('[data-tab-id]').first()).toContainText('Alpha-next');

    await vela.command('back');
    await expect(page.getByTestId('heading')).toHaveText('Alpha');
    await vela.command('forward');
    await expect(page.getByTestId('heading')).toHaveText('Alpha-next');
  });

  test('target=_blank opens a new tab in the same space and the old tab stays', async ({
    vela,
    fixtures,
  }) => {
    await vela.command('newTab');
    const overlay = await vela.overlay();
    await overlay.getByTestId('command-input').fill(`${fixtures}/page/Base`);
    await overlay.getByTestId('command-input').press('Enter');
    const page = await vela.tabPage('/page/Base');
    await page.click('#blank');
    await expect.poll(async () => Object.values((await vela.state()).tabs).length).toBe(2);
    const st = await vela.state();
    const urls = Object.values(st.tabs).map((t) => t.url);
    expect(urls.some((u) => u.includes('Base-popup'))).toBe(true);
    await expect(vela.shell.locator('[data-tab-id]')).toHaveCount(2);
  });

  test('closing the last tab shows the empty state and archives it', async ({ vela, fixtures }) => {
    await vela.command('newTab');
    const overlay = await vela.overlay();
    await overlay.getByTestId('command-input').fill(`${fixtures}/page/Gone`);
    await overlay.getByTestId('command-input').press('Enter');
    await vela.tabPage('/page/Gone');
    await vela.command('closeTab');
    await expect.poll(async () => Object.values((await vela.state()).tabs).length).toBe(0);
    const st = await vela.state();
    expect(st.archive[0]?.url).toContain('Gone');
    await expect(vela.shell.getByText('to open a tab')).toBeVisible();
    await vela.command('reopenTab');
    await expect.poll(async () => Object.values((await vela.state()).tabs).length).toBe(1);
  });

  test('sidebar toggles and content bounds follow', async ({ vela }) => {
    const { shell } = vela;
    await vela.command('toggleSidebar');
    await expect
      .poll(async () => {
        return vela.app.evaluate(() => {
          const g = globalThis as unknown as {
            __vela: { ctx: { windows: { main: { layout: { sidebarVisible: boolean } } } } };
          };
          return g.__vela.ctx.windows.main.layout.sidebarVisible;
        });
      })
      .toBe(false);
    await expect(shell.getByTestId('sidebar-edge')).toBeAttached();
    await vela.shot('04-sidebar-hidden');
    await vela.command('toggleSidebar');
    await expect
      .poll(async () =>
        vela.app.evaluate(() => {
          const g = globalThis as unknown as {
            __vela: { ctx: { windows: { main: { layout: { sidebarVisible: boolean } } } } };
          };
          return g.__vela.ctx.windows.main.layout.sidebarVisible;
        }),
      )
      .toBe(true);
  });
});
