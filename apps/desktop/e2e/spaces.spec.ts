import { expect, test } from './helpers';

test('the Spaces palette lists, filters and switches spaces from the keyboard', async ({ vela }) => {
  await vela.app.evaluate(() => {
    const g = globalThis as unknown as {
      __vela: {
        core: { createSpace: (init: Record<string, unknown>) => { id: string } };
        ctx: { store: { dispatch: (a: unknown) => void } };
      };
    };
    for (const name of ['Work', 'Play', 'Music']) {
      const space = g.__vela.core.createSpace({ name, now: Date.now() });
      g.__vela.ctx.store.dispatch({ type: 'space/create', space });
    }
  });
  await vela.shell.getByTestId('all-spaces').click();
  const overlay = await vela.overlay();
  const palette = overlay.getByTestId('spaces');
  await expect(palette).toBeVisible();
  await expect(overlay.getByTestId('spaces-card')).toHaveCount(4);
  await vela.shot('39-spaces-palette');
  await overlay.getByTestId('spaces-search').fill('mu');
  await expect(overlay.getByTestId('spaces-card')).toHaveCount(1);
  await expect(overlay.getByTestId('spaces-card')).toContainText('Music');
  await overlay.keyboard.press('Enter');
  await vela.overlayHidden();
  await expect
    .poll(async () => (await vela.state()).spaces[(await vela.state()).activeSpaceId]?.name)
    .toBe('Music');
});
