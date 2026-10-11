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
