import type { Page } from '@playwright/test';
import { expect, test, type VelaApp } from './helpers';

type Bridge = { vela: { invoke: (c: string, r: unknown) => Promise<unknown> } };

const invoke = (shell: Page, channel: string, req: unknown): Promise<unknown> =>
  shell.evaluate(([c, r]) => (window as unknown as Bridge).vela.invoke(c, r), [channel, req] as const);

const windowCount = (vela: VelaApp): Promise<number> =>
  vela.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.isVisible()).length);

/** A screen point beside the window, inside the display: "dropped on the desktop". */
async function pointOutside(vela: VelaApp): Promise<{ x: number; y: number }> {
  return vela.app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const area = screen.getPrimaryDisplay().workArea;
    // Runners may open it maximized: leave room on its right first.
    const width = Math.min(900, Math.floor(area.width / 2));
    const height = Math.min(700, area.height - 40);
    if (win?.isMaximized()) win.unmaximize();
    win?.setBounds({ x: area.x + 20, y: area.y + 20, width, height });
    return { x: area.x + 20 + width + 60, y: area.y + 80 };
  });
}

test('a Today tab dropped outside the window tears off into a new window on the same Space', async ({
  vela,
  fixtures,
}) => {
  const a = await vela.openTab(`${fixtures}/page/TearA`);
  await vela.openTab(`${fixtures}/page/TearB`);
  const before = await vela.state();
  const rootId = before.activeSpaceId;
  const p = await pointOutside(vela);
  await invoke(vela.shell, 'tab/dropOut', { tabId: a, ...p });
  await expect.poll(() => windowCount(vela)).toBe(2);
  const s = await vela.state();
  const spaces = s.spaces as Record<
    string,
    { today: string[]; parentId?: string | null; activeTabId: string | null }
  >;
  const instance = Object.entries(spaces).find(([, sp]) => sp.parentId === rootId);
  expect(instance, 'the new window shows an instance of the same Space').toBeDefined();
  expect(instance?.[1].today).toEqual([a]);
  expect(instance?.[1].activeTabId).toBe(a);
  expect(spaces[rootId]?.today).not.toContain(a);
  expect(s.spaceOrder).toEqual(before.spaceOrder);
  await vela.shot('40-tear-off-new-window');
});

test('⌘N opens the same Space with a Today of its own, and closing it folds the Today back', async ({
  vela,
  fixtures,
}) => {
  await vela.openTab(`${fixtures}/page/Home1`);
  const rootId = (await vela.state()).activeSpaceId;
  await vela.command('newWindow');
  await expect.poll(() => windowCount(vela)).toBe(2);
  const s = await vela.state();
  const spaces = s.spaces as Record<string, { today: string[]; parentId?: string | null }>;
  const instanceId = Object.keys(spaces).find((id) => spaces[id]?.parentId === rootId);
  expect(instanceId).toBeDefined();
  expect(spaces[instanceId ?? '']?.today).toEqual([]);
  await vela.app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.close());
  await expect.poll(() => windowCount(vela)).toBe(1);
  await expect
    .poll(async () => Object.keys((await vela.state()).spaces).filter((id) => id !== rootId).length)
    .toBe(0);
});

test('⌘-click on a favorite opens its page as a new Today tab and keeps the favorite', async ({
  vela,
  fixtures,
}) => {
  await vela.app.evaluate((_e, base) => {
    const g = globalThis as unknown as {
      __vela: {
        core: { createTab: (init: Record<string, unknown>) => unknown };
        ctx: { store: { dispatch: (a: unknown) => void } };
      };
    };
    const tab = g.__vela.core.createTab({
      url: `${base}/page/FavCmd`,
      spaceId: null,
      kind: 'favorite',
      title: 'Fav cmd',
      now: Date.now(),
    });
    g.__vela.ctx.store.dispatch({ type: 'tab/open', tab, activate: false });
  }, fixtures);
  const cell = vela.shell.getByTestId('favorites').locator('[data-dnd-fav]').first();
  await cell.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
  await expect
    .poll(async () => {
      const s = await vela.state();
      const space = s.spaces[s.activeSpaceId];
      return (space?.today ?? []).map((id) => s.tabs[id]?.url).filter((u) => u?.includes('/page/FavCmd'))
        .length;
    })
    .toBe(1);
  const s = await vela.state();
  expect(Object.values(s.tabs).filter((t) => t.kind === 'favorite')).toHaveLength(1);
  await vela.shot('41-favorite-cmd-click');
});
