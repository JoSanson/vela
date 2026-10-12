import { expect, test } from './helpers';

test('the favorites grid folds beyond twelve and unfolds on demand', async ({ vela, fixtures }) => {
  await vela.app.evaluate((_e, base) => {
    const g = globalThis as unknown as {
      __vela: {
        core: { createTab: (init: Record<string, unknown>) => unknown };
        ctx: { store: { dispatch: (a: unknown) => void } };
      };
    };
    for (let i = 0; i < 15; i++) {
      const tab = g.__vela.core.createTab({
        url: `${base}/page/Fav${i}`,
        spaceId: null,
        kind: 'favorite',
        title: `Fav ${i}`,
        now: Date.now(),
      });
      g.__vela.ctx.store.dispatch({ type: 'tab/open', tab, activate: false });
    }
  }, fixtures);
  const grid = vela.shell.getByTestId('favorites');
  await expect(grid.locator('[data-dnd-fav]')).toHaveCount(11);
  const more = vela.shell.getByTestId('favorites-more');
  await expect(more).toHaveText('+4');
  await vela.shot('38-favorites-folded');
  await more.click();
  await expect(grid.locator('[data-dnd-fav]')).toHaveCount(15);
  await expect(more).toHaveAttribute('aria-label', 'Show fewer favorites');
  await more.click();
  await expect(grid.locator('[data-dnd-fav]')).toHaveCount(11);
});

test('a favorite with a live page shows the running dot', async ({ vela, fixtures }) => {
  await vela.app.evaluate((_e, base) => {
    const g = globalThis as unknown as {
      __vela: {
        core: { createTab: (init: Record<string, unknown>) => unknown };
        ctx: { store: { dispatch: (a: unknown) => void } };
      };
    };
    for (let i = 0; i < 4; i++) {
      const tab = g.__vela.core.createTab({
        url: `${base}/page/Live${i}`,
        spaceId: null,
        kind: 'favorite',
        title: `Live ${i}`,
        now: Date.now(),
      });
      g.__vela.ctx.store.dispatch({ type: 'tab/open', tab, activate: false });
    }
  }, fixtures);
  const cells = vela.shell.getByTestId('favorites').locator('[data-dnd-fav]');
  await expect(cells).toHaveCount(4);
  await expect(cells.nth(1)).toHaveAttribute('data-loaded', 'false');
  await cells.nth(1).click();
  await expect(cells.nth(1)).toHaveAttribute('data-loaded', 'true');
  await cells.nth(2).click();
  await expect(cells.nth(1)).toHaveAttribute('data-loaded', 'true');
  await expect(cells.nth(2)).toHaveAttribute('data-loaded', 'true');
  await expect(cells.nth(0)).toHaveAttribute('data-loaded', 'false');
  await vela.shell.waitForTimeout(400);
  await vela.shot('39-favorites-live-dot');
});
