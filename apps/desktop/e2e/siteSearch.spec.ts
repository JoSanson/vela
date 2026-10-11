import { expect, test } from './helpers';

test.describe('quick search (keyword + Tab)', () => {
  test('y then Tab searches YouTube from the command bar', async ({ vela, fixtures }) => {
    await vela.openTab(`${fixtures}/page/Start`);
    await vela.command('newTab');
    const overlay = await vela.overlay();
    const input = overlay.getByTestId('command-input');
    await input.fill('y');
    const hint = overlay.getByTestId('command-result').first();
    await expect(hint).toContainText('Search YouTube');
    await expect(hint).toContainText(process.platform === 'darwin' ? '⇥' : 'Tab');
    await input.press('Tab');
    const pill = overlay.getByTestId('command-site');
    await expect(pill).toHaveText('YouTube');
    await expect(input).toHaveValue('');
    await expect(input).toHaveAttribute('placeholder', 'Search YouTube…');
    await expect(overlay.getByTestId('command-result').first()).toContainText('Open YouTube');
    await vela.shot('36-site-search-youtube');
    await input.fill('lo-fi beats');
    await expect(overlay.getByTestId('command-result').first()).toContainText('lo-fi beats');
    await input.press('Backspace');
    await input.fill('');
    await input.press('Backspace');
    await expect(pill).toHaveCount(0);
    await expect(input).toHaveValue('y');
    await input.press('Tab');
    await input.fill('cats');
    await input.press('Enter');
    await expect
      .poll(async () => {
        const st = await vela.state();
        return st.tabs[st.spaces[st.activeSpaceId]?.activeTabId ?? '']?.url;
      })
      .toBe('https://www.youtube.com/results?search_query=cats');
  });

  test('a custom site from Settings works and remembers recent searches', async ({ vela, fixtures }) => {
    await vela.app.evaluate((_e, base) => {
      const g = globalThis as unknown as {
        __vela: { ctx: { prefs: { value: { siteSearches: unknown[] }; set: (p: unknown) => void } } };
      };
      g.__vela.ctx.prefs.set({
        siteSearches: [
          ...g.__vela.ctx.prefs.value.siteSearches,
          {
            id: 'fx',
            keyword: 'fx',
            name: 'Fixtures',
            url: `${base}/page/%s`,
            color: '#10b981',
            suggestUrl: null,
          },
        ],
      });
    }, fixtures);
    await vela.command('newTab');
    const overlay = await vela.overlay();
    const input = overlay.getByTestId('command-input');
    await input.fill('fx');
    await input.press('Tab');
    await expect(overlay.getByTestId('command-site')).toHaveText('Fixtures');
    await input.fill('Pelican');
    await input.press('Enter');
    await vela.overlayHidden();
    await expect
      .poll(async () => Object.values((await vela.state()).tabs).map((t) => t.url))
      .toContain(`${fixtures}/page/Pelican`);
    await expect
      .poll(async () => {
        const st = await vela.state();
        return st.tabs[st.spaces[st.activeSpaceId]?.activeTabId ?? '']?.title;
      })
      .toBe('Pelican');

    await vela.command('newTab');
    const again = await vela.overlay();
    const input2 = again.getByTestId('command-input');
    await input2.fill('fx');
    await input2.press('Tab');
    await expect(again.getByTestId('command-result').nth(1)).toContainText('Pelican');
    await expect(again.getByTestId('command-result').nth(1)).toContainText('Recent on Fixtures');
    await input2.press('ArrowDown');
    await input2.press('Enter');
    await expect
      .poll(
        async () =>
          Object.values((await vela.state()).tabs).filter((t) => t.url.endsWith('/page/Pelican')).length,
      )
      .toBe(2);
  });

  test('the editor in Settings validates keywords and URLs', async ({ vela }) => {
    await vela.openTab('vela://settings');
    const page = await vela.tabPage('vela://settings');
    const row = page.getByTestId('settings-site-search');
    await expect(row.getByTestId('site-search-youtube')).toBeVisible();
    await row.getByTestId('site-search-add').click();
    const rows = row
      .locator('[data-testid^="site-search-"]')
      .filter({ has: page.getByTestId('site-search-keyword') });
    const last = rows.last();
    await expect(last.getByRole('alert')).toContainText('Keyword needed');
    await last.getByTestId('site-search-keyword').fill('y');
    await expect(last.getByRole('alert')).toContainText('Keyword already used');
    await last.getByTestId('site-search-keyword').fill('np');
    await expect(last.getByRole('alert')).toContainText('contain %s');
    await last.getByTestId('site-search-name').fill('npm');
    await last.getByTestId('site-search-url').fill('https://www.npmjs.com/search?q=%s');
    await expect(last.getByRole('alert')).toHaveCount(0);
    await expect
      .poll(() =>
        vela.app.evaluate(() => {
          const g = globalThis as unknown as {
            __vela: { ctx: { prefs: { value: { siteSearches: { keyword: string }[] } } } };
          };
          return g.__vela.ctx.prefs.value.siteSearches.map((s) => s.keyword);
        }),
      )
      .toContain('np');
    await vela.shot('37-settings-site-search');
  });
});
