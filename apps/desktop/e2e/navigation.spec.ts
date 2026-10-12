import { evalMain, expect, test } from './helpers';

test.describe('command bar', () => {
  test('fuzzy-finds an open tab and switches to it; plain words become a search', async ({
    vela,
    fixtures,
  }) => {
    await vela.openTab(`${fixtures}/page/Kangaroo`);
    await vela.openTab(`${fixtures}/page/Zebra`);
    await vela.command('newTab');
    const overlay = await vela.overlay();
    const input = overlay.getByTestId('command-input');
    await input.fill('kang');
    const results = overlay.getByTestId('command-result');
    await expect(results.first()).toContainText('Kangaroo');
    await vela.shot('10-command-fuzzy');
    await input.press('Enter');
    await expect
      .poll(async () => {
        const st = await vela.state();
        return st.tabs[st.spaces[st.activeSpaceId]?.activeTabId ?? '']?.url;
      })
      .toContain('Kangaroo');

    await vela.overlayHidden();
    await vela.command('newTab');
    await input.fill('hello world');
    await expect(results.first()).toContainText('Search');
    await input.press('Escape');
    await expect(overlay.getByTestId('overlay')).toHaveCount(0);
  });

  test('runs browser commands', async ({ vela }) => {
    await vela.command('newTab');
    const overlay = await vela.overlay();
    const input = overlay.getByTestId('command-input');
    await input.fill('toggle sidebar');
    await expect(overlay.getByTestId('command-result').first()).toContainText('Toggle sidebar');
    await input.press('Enter');
    await expect
      .poll(() =>
        vela.app.evaluate(() => {
          const g = globalThis as unknown as {
            __vela: { ctx: { windows: { main: { layout: { sidebarVisible: boolean } } } } };
          };
          return g.__vela.ctx.windows.main.layout.sidebarVisible;
        }),
      )
      .toBe(false);
  });

  test('Cmd+L edits the current URL in place', async ({ vela, fixtures }) => {
    await vela.openTab(`${fixtures}/page/EditMe`);
    await vela.command('editUrl');
    const overlay = await vela.overlay();
    const input = overlay.getByTestId('command-input');
    await expect(input).toHaveValue(`${fixtures}/page/EditMe`);
    await input.fill(`${fixtures}/page/Edited`);
    await input.press('Enter');
    await expect
      .poll(async () => Object.values((await vela.state()).tabs).map((t) => t.url))
      .toEqual([`${fixtures}/page/Edited`]);
  });
});

test.describe('tab switcher', () => {
  test('Ctrl+Tab shows MRU tabs and Enter activates the previous one', async ({ vela, fixtures }) => {
    await vela.openTab(`${fixtures}/page/One`);
    await vela.openTab(`${fixtures}/page/Two`);
    await vela.command('nextTabMru');
    const overlay = await vela.overlay();
    await expect(overlay.getByTestId('switcher')).toBeVisible();
    const items = overlay.getByTestId('switcher-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(1)).toHaveAttribute('data-selected', 'true');
    await vela.shot('11-switcher');
    await overlay.keyboard.press('Enter');
    await expect
      .poll(async () => {
        const st = await vela.state();
        return st.tabs[st.spaces[st.activeSpaceId]?.activeTabId ?? '']?.url;
      })
      .toContain('One');
    await vela.overlayHidden();
    await vela.command('nextTabMru');
    await vela.command('nextTabMru');
    await expect(items.nth(0)).toHaveAttribute('data-selected', 'true');
    await overlay.keyboard.press('Escape');
  });
});

test.describe('find in page', () => {
  test('counts matches and steps through them', async ({ vela, fixtures }) => {
    await vela.openTab(`${fixtures}/page/Findable`);
    await vela.tabPage('/page/Findable');
    await vela.command('findInPage');
    const bar = vela.shell.getByTestId('find-bar');
    await expect(bar).toBeVisible();
    await vela.shell.getByTestId('find-input').fill('lorem');
    await expect(vela.shell.getByTestId('find-count')).toContainText('/400');
    await vela.shell.getByTestId('find-input').press('Enter');
    await expect(vela.shell.getByTestId('find-count')).toContainText('2/400');
    await vela.shot('12-find');
    await vela.shell.getByTestId('find-input').press('Escape');
    await expect(bar).toHaveCount(0);
  });
});

test.describe('split view', () => {
  test('opens a second pane from the command bar, resizes and closes it', async ({ vela, fixtures }) => {
    await vela.openTab(`${fixtures}/page/Left`);
    await vela.command('splitView');
    const overlay = await vela.overlay();
    const input = overlay.getByTestId('command-input');
    await input.fill(`${fixtures}/page/Right`);
    await input.press('Enter');
    await expect
      .poll(async () => (await vela.state()).spaces[(await vela.state()).activeSpaceId]?.split?.panes.length)
      .toBe(2);
    await vela.overlayHidden();
    const bounds = await vela.app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win?.contentView.children.map((c) => c.getBounds()) ?? [];
    });
    // Both panes share one split row (Arc's), in pane order: left, then right.
    await expect(vela.shell.locator('[data-tab-id]').first()).toContainText('Left');
    await expect(vela.shell.locator('[data-tab-id]').nth(1)).toContainText('Right');
    const wide = bounds.filter((b) => b.width > 100);
    expect(wide.length).toBe(2);
    expect(Math.abs((wide[0]?.width ?? 0) - (wide[1]?.width ?? 0))).toBeLessThan(4);
    await vela.shot('13-split');

    const handle = vela.shell.getByTestId('split-handle');
    await expect(handle).toBeVisible();
    const box = await handle.boundingBox();
    if (!box) throw new Error('no handle');
    await vela.shell.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await vela.shell.mouse.down();
    await vela.shell.mouse.move(box.x + 200, box.y + box.height / 2, { steps: 8 });
    await vela.shell.mouse.up();
    await expect
      .poll(async () => {
        const st = await vela.state();
        const s = st.spaces[st.activeSpaceId]?.split as { sizes: number[] } | null;
        return s?.sizes[0] ?? 0;
      })
      .toBeGreaterThan(0.55);

    await vela.command('closeSplit');
    await expect
      .poll(async () => (await vela.state()).spaces[(await vela.state()).activeSpaceId]?.split)
      .toBeNull();
  });
});

test.describe('peek', () => {
  test('a cross-site link from a pinned tab opens in Peek; "open as tab" promotes it', async ({
    vela,
    fixtures,
  }) => {
    await vela.openTab(`${fixtures}/page/Pinned`);
    await vela.command('pinTab');
    await expect.poll(async () => Object.values((await vela.state()).tabs)[0]?.kind).toBe('pinned');
    const page = await vela.tabPage('/page/Pinned');
    await page.click('#ext', { noWaitAfter: true });
    const overlay = await vela.overlay();
    await expect(overlay.getByTestId('peek-toolbar')).toBeVisible();
    await vela.tabPage('localhost');
    await expect(overlay.getByTestId('peek-toolbar')).toContainText('Pinned-external');
    await vela.shot('14-peek');
    expect(page.url()).toContain('/page/Pinned');
    await overlay.getByTestId('peek-open').click();
    await expect.poll(async () => Object.values((await vela.state()).tabs).length).toBe(2);
    const st = await vela.state();
    expect(Object.values(st.tabs).some((t) => t.url.includes('localhost') && t.kind === 'today')).toBe(true);
    // The peek view itself becomes the tab's view: no second renderer for the same page.
    const count = await vela.app.evaluate(
      ({ webContents }) =>
        webContents.getAllWebContents().filter((w) => w.getURL().includes('Pinned-external')).length,
    );
    expect(count).toBe(1);
  });
});

test.describe('little window', () => {
  test('opens a floating window for an external link and sends it to the main window', async ({
    vela,
    fixtures,
  }) => {
    await vela.command('littleWindow', { url: `${fixtures}/page/Little` });
    const little = await vela.tabPage('little.html');
    await expect(little.getByTestId('little-bar')).toBeVisible();
    await expect(little.getByTestId('little-url')).toContainText('page/Little');
    await expect
      .poll(() => vela.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
      .toBe(2);
    await little.getByTestId('little-send').click();
    await expect
      .poll(async () => Object.values((await vela.state()).tabs).map((t) => t.url))
      .toContain(`${fixtures}/page/Little`);
    await expect
      .poll(() => vela.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
      .toBe(1);
  });
});

test.describe('windows', () => {
  test('⌘N opens a second window on another space; tabs of that space live there', async ({
    vela,
    fixtures,
  }) => {
    const first = await vela.openTab(`${fixtures}/page/One`);
    await vela.command('newWindow');
    await expect
      .poll(() => evalMain<number>(vela, 'return __vela.ctx.windows.all().length'), { timeout: 15_000 })
      .toBe(2);
    const wins = await evalMain<{ id: number; spaceId: string }[]>(
      vela,
      'return __vela.ctx.windows.all().map((w) => ({ id: w.win.id, spaceId: w.spaceId }))',
    );
    expect(new Set(wins.map((w) => w.spaceId)).size).toBe(2);
    const firstSpace = (await vela.state()).spaceOrder[0];
    const second = wins.find((w) => w.spaceId !== firstSpace) ?? wins[1];
    if (!second) throw new Error('no second window');
    await evalMain(
      vela,
      `__vela.ctx.tabs.openUrl({ input: ${JSON.stringify(`${fixtures}/page/Two`)}, spaceId: ${JSON.stringify(second.spaceId)}, noAtc: true })`,
    );
    await expect
      .poll(() =>
        evalMain<number | null>(
          vela,
          "const t = Object.values(__vela.ctx.store.state.tabs).find((x) => x.url.includes('/page/Two')); return t ? (__vela.ctx.tabs.windowOf(t.id)?.win.id ?? null) : null",
        ),
      )
      .toBe(second.id);
    // The first window keeps showing its own space and tab.
    expect(
      await evalMain<number | null>(
        vela,
        `return __vela.ctx.tabs.windowOf(${JSON.stringify(first)})?.win.id ?? null`,
      ),
    ).not.toBe(second.id);
    await evalMain(vela, `__vela.ctx.windows.byId(${second.id}).win.close()`);
    await expect.poll(() => evalMain<number>(vela, 'return __vela.ctx.windows.all().length')).toBe(1);
    expect((await vela.state()).tabs[first]).toBeDefined();
    await expect(vela.shell.locator(`[data-tab-id="${first}"]`)).toBeVisible();
  });
});
