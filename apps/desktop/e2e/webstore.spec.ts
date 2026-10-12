import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evalMain, expect, launchVela, test, type VelaApp } from './helpers';

// Dark Reader: popular, MV3, an action popup, and it needs chrome.permissions (which only the
// extension API layer provides), so it proves install, APIs and toolbar in one go.
const DARK_READER = 'eimadpbcbfnmbkopoojfekhnkhdbieeh';
// `hl=en`: the store follows the OS language otherwise, and the button label with it.
const STORE_PAGE = `https://chromewebstore.google.com/detail/dark-reader/${DARK_READER}?hl=en`;

interface Asked {
  message: string;
  detail: string;
}

/** Replaces the native confirm with a scripted answer and records what the user would have read. */
async function answerInstallPrompt(vela: VelaApp, accept: boolean): Promise<void> {
  await vela.app.evaluate(({ dialog }, ok) => {
    const g = globalThis as { __asked?: Asked[] };
    g.__asked = [];
    dialog.showMessageBox = (...args: unknown[]) => {
      const o = (args.length > 1 ? args[1] : args[0]) as Asked;
      g.__asked?.push({ message: o.message, detail: o.detail });
      return Promise.resolve({ response: ok ? 0 : 1, checkboxChecked: false });
    };
  }, accept);
}

/** Opens the Web Store page and clicks "Add to Vela"; false when the store is unreachable. */
async function clickAddFromStore(vela: VelaApp): Promise<boolean> {
  // Not vela.openTab: the store rewrites its URL, which that helper waits on.
  await evalMain(vela, `__vela.ctx.tabs.openUrl({ input: ${JSON.stringify(STORE_PAGE)}, noAtc: true })`);
  const page = await vela.tabPage('chromewebstore.google.com').catch(() => null);
  if (!page) return false;
  const button = page.getByRole('button', { name: /^add to /i });
  try {
    await button.waitFor({ timeout: 20_000 });
  } catch {
    return false;
  }
  await expect(button).toHaveText(/add to vela/i);
  await button.click();
  return true;
}

const listed = (vela: VelaApp) =>
  evalMain<{ id: string; name: string; source: string }[]>(vela, 'return __vela.ctx.extensions.list()');

test.describe('Chrome Web Store', () => {
  test('a refused install leaves nothing behind', async ({ vela }) => {
    await answerInstallPrompt(vela, false);
    test.skip(!(await clickAddFromStore(vela)), 'Chrome Web Store unreachable (offline?)');
    await expect
      .poll(() => vela.app.evaluate(() => (globalThis as { __asked?: Asked[] }).__asked?.length ?? 0))
      .toBe(1);
    await new Promise((r) => setTimeout(r, 1500));
    expect(await listed(vela)).toEqual([]);
  });

  test('installs from the store page, shows the button, reaches every profile and survives a restart', async ({
    fixtures,
  }) => {
    const userData = mkdtempSync(join(tmpdir(), 'vela-webstore-'));
    let vela = await launchVela({ fixtures, userData });
    try {
      await answerInstallPrompt(vela, true);
      test.skip(!(await clickAddFromStore(vela)), 'Chrome Web Store unreachable (offline?)');
      await expect
        .poll(async () => (await listed(vela)).map((e) => `${e.id}:${e.source}`), { timeout: 60_000 })
        .toContain(`${DARK_READER}:webstore`);

      // The user saw Chrome's wording for what it can do, and where it applies.
      const asked = await vela.app.evaluate(() => (globalThis as { __asked?: Asked[] }).__asked ?? []);
      expect(asked[0]?.message).toBe('Add “Dark Reader”?');
      expect(asked[0]?.detail).toContain('Read and change all your data on all websites');
      expect(asked[0]?.detail).toContain('every space and profile');

      // Its button is pinned in the sidebar's extension bar.
      await expect(vela.shell.getByTestId('extension-bar').getByTestId('extension-tile')).toHaveCount(1, {
        timeout: 20_000,
      });
      await vela.shot('70-webstore-extension-button');

      // A Space with its own profile gets the extension too.
      await evalMain(
        vela,
        `const { core, ctx } = __vela;
         const p = core.createProfile('Work', '#2a78d6');
         ctx.store.dispatch({ type: 'profile/create', profile: p });
         ctx.sessions.get(p.partition);
         globalThis.__workPartition = p.partition;`,
      );
      await expect
        .poll(() =>
          vela.app.evaluate(
            ({ session }, id) =>
              !!session
                .fromPartition((globalThis as { __workPartition?: string }).__workPartition ?? '')
                .extensions.getExtension(id),
            DARK_READER,
          ),
        )
        .toBe(true);

      await vela.close();
      vela = await launchVela({ fixtures, userData });
      await expect
        .poll(async () => (await listed(vela)).map((e) => e.id), { timeout: 20_000 })
        .toContain(DARK_READER);

      await evalMain(vela, "__vela.ctx.tabs.openUrl({ input: 'vela://settings/#extensions', noAtc: true })");
      const settings = await vela.tabPage('vela://settings');
      await expect(settings.getByTestId('extension-source')).toHaveText('Chrome Web Store');
      await vela.shot('71-webstore-settings');

      await evalMain(vela, `return __vela.ctx.extensions.remove(${JSON.stringify(DARK_READER)})`);
      await expect.poll(async () => (await listed(vela)).length).toBe(0);
    } finally {
      await vela.close();
    }
  });
});
