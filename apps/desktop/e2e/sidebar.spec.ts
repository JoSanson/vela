import { expect, test, type VelaApp } from './helpers';

async function openTab(vela: VelaApp, url: string): Promise<string> {
  const id = await vela.app.evaluate((_e, u) => {
    const g = globalThis as unknown as {
      __vela: { ctx: { tabs: { openUrl: (r: { input: string; noAtc: boolean }) => string } } };
    };
    return g.__vela.ctx.tabs.openUrl({ input: u, noAtc: true });
  }, url);
  await expect(vela.shell.locator(`[data-tab-id="${id}"]`)).toBeVisible();
  return id;
}

/** Rows glide into place after a reorder (FLIP); wait for that before measuring them. */
async function settled(vela: VelaApp, selector: string): Promise<void> {
  await vela.shell
    .locator(selector)
    .evaluate((el) =>
      Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined))),
    );
}

async function dragRow(vela: VelaApp, fromId: string, to: { x: number; y: number }): Promise<void> {
  const row = vela.shell.locator(`[data-dnd-row="${fromId}"]`);
  await settled(vela, '[data-testid="sidebar"]');
  const box = await row.boundingBox();
  if (!box) throw new Error('row not visible');
  await vela.shell.mouse.move(box.x + 40, box.y + box.height / 2);
  await vela.shell.mouse.down();
  await vela.shell.mouse.move(box.x + 44, box.y + box.height / 2 + 8, { steps: 3 });
  await vela.shell.mouse.move(to.x, to.y, { steps: 10 });
  await vela.shell.mouse.up();
}

test.describe('sidebar', () => {
  test('pin, rename with F2, set an emoji, create a folder and nest a tab by drag & drop', async ({
    vela,
    fixtures,
  }) => {
    const a = await openTab(vela, `${fixtures}/page/Alpha`);
    const b = await openTab(vela, `${fixtures}/page/Beta`);
    await vela.command('pinTab');
    await expect.poll(async () => (await vela.state()).tabs[b]?.kind).toBe('pinned');
    await expect(vela.shell.getByTestId('pinned').locator(`[data-tab-id="${b}"]`)).toBeVisible();

    // rename
    await vela.shell.locator(`[data-tab-id="${b}"]`).focus();
    await vela.shell.keyboard.press('F2');
    const edit = vela.shell.getByTestId('inline-edit');
    await expect(edit).toBeVisible();
    await edit.fill('My Beta');
    await edit.press('Enter');
    await expect(vela.shell.locator(`[data-tab-id="${b}"]`)).toContainText('My Beta');
    await expect.poll(async () => (await vela.state()).tabs[b]?.title).toBe('Beta');

    // emoji via the ui command the native context menu triggers
    await vela.app.evaluate((_e, id) => {
      const g = globalThis as unknown as {
        __vela: {
          ctx: { windows: { main: { win: { webContents: { send: (ch: string, p: unknown) => void } } } } };
        };
      };
      g.__vela.ctx.windows.main.win.webContents.send('vela:ui/command', { id: 'pickIcon', payload: { id } });
    }, b);
    const picker = vela.shell.getByTestId('emoji-picker');
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: '🚀' }).click();
    await expect.poll(async () => (await vela.state()).tabs[b]?.emoji).toBe('🚀');

    // new folder
    await vela.app.evaluate(() => {
      const g = globalThis as unknown as {
        __vela: {
          ctx: { windows: { main: { win: { webContents: { send: (ch: string, p: unknown) => void } } } } };
        };
      };
      g.__vela.ctx.windows.main.win.webContents.send('vela:ui/command', { id: 'newFolder', payload: {} });
    });
    await expect(vela.shell.getByTestId('inline-edit')).toBeVisible();
    await vela.shell.getByTestId('inline-edit').fill('Work');
    await vela.shell.getByTestId('inline-edit').press('Enter');
    const folderRow = vela.shell.locator('[data-dnd-type="folder"]');
    await expect(folderRow).toContainText('Work');

    // drag Alpha (today) into the folder
    const fb = await folderRow.boundingBox();
    if (!fb) throw new Error('no folder');
    await dragRow(vela, a, { x: fb.x + fb.width / 2, y: fb.y + fb.height / 2 });
    await expect
      .poll(async () => {
        const st = await vela.state();
        const folder = Object.values(
          (st as unknown as { folders: Record<string, { children: string[] }> }).folders,
        )[0];
        return folder?.children ?? [];
      })
      .toEqual([a]);
    await expect.poll(async () => (await vela.state()).tabs[a]?.kind).toBe('pinned');
    await vela.shot('20-sidebar-folder');
  });

  test('reorders Today tabs and drops a tab onto the favorites zone', async ({ vela, fixtures }) => {
    const a = await openTab(vela, `${fixtures}/page/A`);
    const b = await openTab(vela, `${fixtures}/page/B`);
    const c = await openTab(vela, `${fixtures}/page/C`);
    let st = await vela.state();
    expect(st.spaces[st.activeSpaceId]?.today).toEqual([c, b, a]);
    const rowA = await vela.shell.locator(`[data-dnd-row="${a}"]`).boundingBox();
    const rowC = await vela.shell.locator(`[data-dnd-row="${c}"]`).boundingBox();
    if (!rowA || !rowC) throw new Error('rows');
    await dragRow(vela, a, { x: rowC.x + 40, y: rowC.y + 3 });
    await expect
      .poll(async () => (await vela.state()).spaces[(await vela.state()).activeSpaceId]?.today)
      .toEqual([a, c, b]);

    // drag B to favorites: the zone appears while dragging
    await settled(vela, '[data-testid="sidebar"]');
    const rowB = await vela.shell.locator(`[data-dnd-row="${b}"]`).boundingBox();
    if (!rowB) throw new Error('rowB');
    await vela.shell.mouse.move(rowB.x + 40, rowB.y + rowB.height / 2);
    await vela.shell.mouse.down();
    await vela.shell.mouse.move(rowB.x + 44, rowB.y + 10, { steps: 3 });
    const fav = vela.shell.getByTestId('favorites');
    await expect(fav).toBeVisible();
    const fbx = await fav.boundingBox();
    if (!fbx) throw new Error('fav');
    await vela.shell.mouse.move(fbx.x + fbx.width / 2, fbx.y + fbx.height / 2, { steps: 8 });
    await vela.shell.mouse.up();
    st = await vela.state();
    expect(st.favorites).toEqual([b]);
    expect(st.tabs[b]?.kind).toBe('favorite');
    await vela.shot('21-sidebar-favorites');
  });

  test('drops a tab on the content area to open a split', async ({ vela, fixtures }) => {
    await openTab(vela, `${fixtures}/page/Main`);
    const second = await openTab(vela, `${fixtures}/page/Side`);
    await vela.app.evaluate(
      (_e, id) => {
        const g = globalThis as unknown as { __vela: { ctx: { store: { dispatch: (a: unknown) => void } } } };
        g.__vela.ctx.store.dispatch({ type: 'tab/activate', id, now: Date.now() });
      },
      (await vela.state()).spaces[(await vela.state()).activeSpaceId]?.today[1],
    );
    const content = await vela.shell.getByTestId('content').boundingBox();
    if (!content) throw new Error('content');
    await dragRow(vela, second, { x: content.x + content.width * 0.8, y: content.y + content.height / 2 });
    await expect
      .poll(async () => (await vela.state()).spaces[(await vela.state()).activeSpaceId]?.split?.panes.length)
      .toBe(2);
  });

  test('hovering the left edge reveals a floating sidebar when hidden', async ({ vela, fixtures }) => {
    await openTab(vela, `${fixtures}/page/Hidden`);
    await vela.command('toggleSidebar');
    await expect.poll(() => layout(vela).then((l) => l.sidebarVisible)).toBe(false);
    await vela.shell.getByTestId('sidebar-edge').hover();
    const overlay = await vela.overlay();
    await expect(overlay.locator('[data-testid="sidebar"][data-floating="true"]')).toBeVisible();
    await vela.shot('22-floating-sidebar');
    await overlay.keyboard.press('Escape');
    await expect(overlay.getByTestId('overlay')).toHaveCount(0);
  });

  test('the toggle in the floating sidebar docks it back', async ({ vela, fixtures }) => {
    await openTab(vela, `${fixtures}/page/Dock`);
    await vela.command('toggleSidebar');
    await expect.poll(() => layout(vela).then((l) => l.sidebarVisible)).toBe(false);
    await vela.shell.getByTestId('sidebar-edge').hover();
    const overlay = await vela.overlay();
    const floating = overlay.locator('[data-testid="sidebar"][data-floating="true"]');
    await expect(floating).toBeVisible();
    await floating.getByRole('button', { name: 'Hide sidebar' }).click();
    await expect.poll(() => layout(vela).then((l) => l.sidebarVisible)).toBe(true);
    await expect(overlay.getByTestId('overlay')).toHaveCount(0);
    await expect(vela.shell.locator('[data-testid="sidebar"][data-floating="false"]')).toBeVisible();
    await expect.poll(() => layout(vela).then((l) => l.sidebarReveal)).toBeUndefined();
  });
});

async function layout(vela: VelaApp): Promise<{ sidebarVisible: boolean; sidebarReveal?: number }> {
  return vela.app.evaluate(() => {
    const g = globalThis as unknown as {
      __vela: { ctx: { windows: { main: { layout: { sidebarVisible: boolean; sidebarReveal?: number } } } } };
    };
    return g.__vela.ctx.windows.main.layout;
  });
}

test.describe('spaces', () => {
  test('creates a themed space with the editor, switches with Ctrl+2 and deletes it', async ({
    vela,
    fixtures,
  }) => {
    await openTab(vela, `${fixtures}/page/Home`);
    await vela.shell.getByTestId('new-space').click();
    const overlay = await vela.overlay();
    const editor = overlay.getByTestId('space-editor');
    await expect(editor).toBeVisible();
    await overlay.getByTestId('space-name-input').fill('Work');
    await overlay.getByRole('button', { name: /Theme #FF7A59/i }).click();
    await overlay.getByTestId('new-profile-name').fill('Pro');
    await overlay.getByTestId('add-profile').click();
    await vela.shot('23-space-editor');
    await overlay.getByTestId('space-save').click();
    await expect.poll(async () => (await vela.state()).spaceOrder.length).toBe(2);
    let st = await vela.state();
    const work = st.spaces[st.activeSpaceId];
    expect(work?.name).toBe('Work');
    // Registered colour property: computed as rgb(), and it cross-fades over 320 ms.
    await expect
      .poll(() =>
        vela.shell.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--space-from').trim(),
        ),
      )
      .toBe('rgb(255, 122, 89)');
    expect(
      Object.values((st as unknown as { profiles: Record<string, { name: string }> }).profiles)[0]?.name,
    ).toBe('Pro');
    await expect(vela.shell.getByTestId('space-name')).toContainText('Work');
    await expect(vela.shell.locator('[data-tab-id]')).toHaveCount(0);

    await vela.command('space1');
    await expect.poll(async () => (await vela.state()).activeSpaceId).toBe(st.spaceOrder[0]);
    await expect(vela.shell.locator('[data-tab-id]')).toHaveCount(1);
    await vela.command('space2');
    await expect.poll(async () => (await vela.state()).activeSpaceId).toBe(work?.id);

    await vela.shell.getByTestId('space-name').click();
    await expect(overlay.getByTestId('space-editor')).toBeVisible();
    await overlay.getByTestId('space-delete').click();
    await expect.poll(async () => (await vela.state()).spaceOrder.length).toBe(1);
    st = await vela.state();
    expect(st.activeSpaceId).toBe(st.spaceOrder[0]);
  });
});
