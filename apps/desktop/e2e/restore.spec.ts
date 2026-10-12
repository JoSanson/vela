import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, launchVela, test } from './helpers';

test('session survives kill -9: tabs, pins, folders and active tab come back, lazily', async ({
  fixtures,
}) => {
  const userData = mkdtempSync(join(tmpdir(), 'vela-restore-'));
  let vela = await launchVela({ fixtures, userData });
  const a = await vela.openTab(`${fixtures}/page/First`);
  const b = await vela.openTab(`${fixtures}/page/Second`);
  await vela.command('pinTab');
  await expect.poll(async () => (await vela.state()).tabs[b]?.kind).toBe('pinned');
  await vela.openTab(`${fixtures}/page/Third`);
  await vela.shell.locator(`[data-tab-id="${a}"]`).click();
  await expect
    .poll(async () => (await vela.state()).spaces[(await vela.state()).activeSpaceId]?.activeTabId)
    .toBe(a);
  // Let the debounced writer flush (150 ms), then kill hard.
  await new Promise((r) => setTimeout(r, 400));
  const pid = vela.app.process().pid;
  if (!pid) throw new Error('no pid');
  // Windows: kill the whole tree, or Chromium's children keep the profile locked for the relaunch.
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F']);
  else process.kill(pid, 'SIGKILL');
  await vela.app.waitForEvent('close').catch(() => undefined);

  vela = await launchVela({ fixtures, userData });
  try {
    const st = await vela.state();
    expect(Object.keys(st.tabs).sort()).toHaveLength(3);
    expect(st.tabs[b]?.kind).toBe('pinned');
    expect(st.spaces[st.activeSpaceId]?.activeTabId).toBe(a);
    await expect(vela.shell.locator('[data-tab-id]')).toHaveCount(3);
    // Only the active tab is loaded after restore; the others stay cold until clicked.
    await expect.poll(async () => (await vela.state()).tabs[a]?.loaded).toBe(true);
    expect(st.tabs[b]?.loaded).toBe(false);
    const live = await vela.app.evaluate(() => {
      const g = globalThis as unknown as { __vela: { ctx: { tabs: { liveTabIds: () => string[] } } } };
      return g.__vela.ctx.tabs.liveTabIds();
    });
    expect(live).toEqual([a]);
    await vela.tabPage('/page/First');
    await vela.shot('35-restored');
  } finally {
    await vela.close();
  }
});
