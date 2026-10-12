import { expect, test } from './helpers';

test.describe('command bar intelligence', () => {
  test('nothing typed: recent tabs, grouped', async ({ vela, fixtures }) => {
    await vela.openTab(`${fixtures}/page/Kangaroo`);
    await vela.openTab(`${fixtures}/page/Zebra`);
    await vela.command('newTab');
    const overlay = await vela.overlay();
    await expect(overlay.getByText('Tabs', { exact: true })).toBeVisible();
    await expect(overlay.getByTestId('command-result').first()).toContainText('Kangaroo');
    await vela.shot('40-omnibox-home');
  });

  test('one row per page: an open tab is offered as "Switch to tab"', async ({ vela, fixtures }) => {
    await vela.openTab(`${fixtures}/page/Zebra`);
    await vela.openTab(`${fixtures}/page/Alpha`);
    await vela.command('newTab');
    const overlay = await vela.overlay();
    await overlay.getByTestId('command-input').fill('zebra');
    const first = overlay.getByTestId('command-result').first();
    await expect(first).toHaveAttribute('data-kind', 'tab');
    await expect(first).toContainText('Switch to tab');
    await expect(overlay.locator('[data-testid="command-result"][data-kind="history"]')).toHaveCount(0);
    await vela.shot('41-omnibox-switch');
  });

  test('forgives typos', async ({ vela, fixtures }) => {
    await vela.openTab(`${fixtures}/page/Kangaroo`);
    await vela.openTab(`${fixtures}/page/Alpha`);
    await vela.command('newTab');
    const overlay = await vela.overlay();
    await overlay.getByTestId('command-input').fill('kanagroo');
    await expect(overlay.getByTestId('command-result').first()).toContainText('Kangaroo');
  });

  test('learns: the page picked for an input leads the next time', async ({ vela, fixtures }) => {
    await vela.openTab(`${fixtures}/page/Kangaroo`);
    await vela.command('closeTab');
    await expect.poll(async () => Object.values((await vela.state()).tabs).length).toBe(0);

    await vela.command('newTab');
    let overlay = await vela.overlay();
    await overlay.getByTestId('command-input').fill('kanga');
    const results = overlay.getByTestId('command-result');
    await expect(results.first()).toHaveAttribute('data-kind', 'search');
    await results.filter({ hasText: 'Kangaroo' }).first().click();
    await expect.poll(async () => Object.values((await vela.state()).tabs).length).toBe(1);
    await vela.overlayHidden();
    await vela.command('closeTab');
    await expect.poll(async () => Object.values((await vela.state()).tabs).length).toBe(0);

    await vela.command('newTab');
    overlay = await vela.overlay();
    await overlay.getByTestId('command-input').fill('kanga');
    await expect(overlay.getByTestId('command-result').first()).toContainText('Kangaroo');
    await expect(overlay.getByTestId('command-result').first()).not.toHaveAttribute('data-kind', 'search');
    await vela.shot('42-omnibox-learned');
  });

  test('answers arithmetic inline and copies the result', async ({ vela }) => {
    await vela.command('newTab');
    const overlay = await vela.overlay();
    const input = overlay.getByTestId('command-input');
    await input.fill('12*12');
    const first = overlay.getByTestId('command-result').first();
    await expect(first).toHaveAttribute('data-kind', 'answer');
    await expect(first).toContainText('144');
    await vela.shot('43-omnibox-calc');
    await input.press('Enter');
    await expect.poll(() => vela.app.evaluate(({ clipboard }) => clipboard.readText())).toBe('144');
  });

  test('converts units', async ({ vela }) => {
    await vela.command('newTab');
    const overlay = await vela.overlay();
    await overlay.getByTestId('command-input').fill('10 km to mi');
    await expect(overlay.getByTestId('command-result').first()).toContainText('6.2137 mi');
  });

  test('">" narrows to commands', async ({ vela }) => {
    await vela.command('newTab');
    const overlay = await vela.overlay();
    await overlay.getByTestId('command-input').fill('> side');
    const results = overlay.getByTestId('command-result');
    await expect(results.first()).toContainText('Toggle sidebar');
    const kinds = await results.evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
    expect(kinds.every((k) => k === 'command')).toBe(true);
  });

  test('Shift+Enter opens the result in split view', async ({ vela, fixtures }) => {
    await vela.openTab(`${fixtures}/page/Left`);
    await vela.command('newTab');
    const overlay = await vela.overlay();
    const input = overlay.getByTestId('command-input');
    await input.fill(`${fixtures}/page/Right`);
    await input.press('Shift+Enter');
    await expect
      .poll(async () => {
        const st = await vela.state();
        return st.spaces[st.activeSpaceId]?.split?.panes.length;
      })
      .toBe(2);
  });
});
