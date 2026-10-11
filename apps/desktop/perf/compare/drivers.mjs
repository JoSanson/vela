import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { _electron as electron } from '@playwright/test';
import { activate, isAlive, waitExit } from './system.mjs';
import { APP_ROOT } from '../vela.mjs';

export const ARC_BIN = '/Applications/Arc.app/Contents/MacOS/Arc';
export const VELA_BIN = join(APP_ROOT, 'release/mac-arm64/Vela.app/Contents/MacOS/Vela');
/** Both windows get the exact same frame on the built-in display (below the menu bar). */
export const BOUNDS = { x: 0, y: 33, width: 1512, height: 949 };

async function poll(fn, { timeout = 30_000, interval = 25, label = 'condition' } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn().catch(() => false);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
    await sleep(interval);
  }
}

export const arcPid = () => {
  try {
    return Number(execFileSync('pgrep', ['-f', ARC_BIN], { encoding: 'utf8' }).trim().split('\n')[0]) || null;
  } catch {
    return null;
  }
};

export async function quitArc() {
  const pid = arcPid();
  if (!pid) return;
  execFileSync('osascript', ['-e', 'quit app "Arc"']);
  await waitExit(pid, 30_000);
  await sleep(1500);
}

class Cdp {
  constructor(url) {
    this.id = 0;
    this.pending = new Map();
    this.ws = new globalThis.WebSocket(url);
    this.ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      const p = this.pending.get(d.id);
      if (!p) return;
      this.pending.delete(d.id);
      if (d.error) p.reject(new Error(`${p.method}: ${d.error.message}`));
      else p.resolve(d.result);
    };
  }
  open() {
    return new Promise((r, j) => {
      this.ws.onopen = r;
      this.ws.onerror = j;
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  close() {
    this.ws.close();
  }
}

/** Arc driven over CDP: `Target.createTarget` adds a real tab to the active Space's sidebar. */
export async function startArc({ port = 9333 } = {}) {
  if (arcPid()) await quitArc();
  spawn(ARC_BIN, [`--remote-debugging-port=${port}`], { detached: true, stdio: 'ignore' }).unref();
  const version = await poll(
    async () => (await globalThis.fetch(`http://127.0.0.1:${port}/json/version`)).json(),
    {
      label: 'Arc CDP',
    },
  );
  const cdp = new Cdp(version.webSocketDebuggerUrl);
  await cdp.open();
  const pid = await poll(async () => arcPid(), { label: 'Arc pid' });
  const sessions = new Map();
  const session = async (targetId) => {
    if (!sessions.has(targetId))
      sessions.set(
        targetId,
        (await cdp.send('Target.attachToTarget', { targetId, flatten: true })).sessionId,
      );
    return sessions.get(targetId);
  };
  const evaluate = async (targetId, expression) => {
    const r = await cdp.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      await session(targetId),
    );
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.value;
  };
  const pages = async () =>
    (await cdp.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page');
  const preexisting = new Set((await pages()).map((t) => t.targetId));
  const mine = new Set();
  return {
    name: 'Arc',
    version: execFileSync(
      'defaults',
      ['read', '/Applications/Arc.app/Contents/Info.plist', 'CFBundleShortVersionString'],
      {
        encoding: 'utf8',
      },
    ).trim(),
    chromium: version.Browser,
    pid,
    preexistingPages: preexisting.size,
    async openTab(url) {
      const t0 = Date.now();
      const { targetId } = await cdp.send('Target.createTarget', { url });
      mine.add(targetId);
      return { id: targetId, t0 };
    },
    async waitLoaded(tab, timeout = 30_000) {
      await poll(async () => (await evaluate(tab.id, 'document.readyState')) === 'complete', {
        timeout,
        label: 'Arc load',
      });
    },
    evaluate: (tab, expr) => evaluate(tab.id, expr),
    async closeTab(tab) {
      sessions.delete(tab.id);
      mine.delete(tab.id);
      await cdp.send('Target.closeTarget', { targetId: tab.id }).catch(() => undefined);
    },
    async closeAllMine() {
      for (const id of [...mine]) await this.closeTab({ id });
    },
    async setBounds() {
      const target = (await pages())[0];
      if (!target) return;
      const { windowId } = await cdp.send('Browser.getWindowForTarget', { targetId: target.targetId });
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
      await cdp.send('Browser.setWindowBounds', {
        windowId,
        bounds: { left: BOUNDS.x, top: BOUNDS.y, width: BOUNDS.width, height: BOUNDS.height },
      });
    },
    async clearCache() {
      const t = await this.openTab('about:blank');
      await cdp.send('Network.clearBrowserCache', {}, await session(t.id)).catch(() => undefined);
      await this.closeTab(t);
    },
    activate: () => activate(pid),
    setBlocker: async () => undefined,
    async armSwitch(tabs, probe) {
      for (const t of tabs) await evaluate(t.id, probe);
    },
    async readSwitch(tabs) {
      const all = [];
      for (const t of tabs) all.push(...(await evaluate(t.id, 'window.__sw')));
      return all;
    },
    async close() {
      await this.closeAllMine();
      cdp.close();
      await quitArc();
    },
  };
}

/**
 * The packaged Vela.app (same binary users run), fresh profile, driven by Playwright through the
 * main process. `VELA_E2E` only exposes `globalThis.__vela` and skips filter-list network refreshes.
 */
export async function startVela({ blocker = true } = {}) {
  const userData = mkdtempSync(join(tmpdir(), 'vela-vs-arc-'));
  writeFileSync(
    join(userData, 'prefs.json'),
    JSON.stringify({ onboardingDone: true, blockerEnabled: blocker }),
  );
  const app = await electron.launch({
    executablePath: VELA_BIN,
    args: [],
    env: { ...process.env, VELA_USER_DATA: userData, VELA_E2E: '1' },
    timeout: 30_000,
  });
  const shell = await app.firstWindow();
  await shell.waitForSelector('[data-ready="true"]', { timeout: 20_000 });
  const pid = app.process().pid;
  const info = await app.evaluate(({ app: a }) => ({
    version: a.getVersion(),
    chromium: process.versions.chrome,
    electron: process.versions.electron,
  }));
  const evaluate = (tab, expr) =>
    app.evaluate(
      (_e, a) => {
        const wc = globalThis.__vela.ctx.tabs.webContents(a.id);
        if (!wc) throw new Error('no webContents');
        return wc.executeJavaScript(a.expr, true);
      },
      { id: tab.id, expr },
    );
  const mine = new Set();
  return {
    name: blocker ? 'Vela' : 'Vela (blocker off)',
    version: info.version,
    chromium: `Chrome/${info.chromium} (Electron ${info.electron})`,
    pid,
    userData,
    preexistingPages: 0,
    app,
    async openTab(url) {
      const t0 = Date.now();
      const id = await app.evaluate(
        (_e, input) => globalThis.__vela.ctx.tabs.openUrl({ input, noAtc: true }),
        url,
      );
      mine.add(id);
      return { id, t0 };
    },
    async waitLoaded(tab, timeout = 30_000) {
      await poll(
        async () => {
          const wc = await app.evaluate((_e, id) => {
            const w = globalThis.__vela.ctx.tabs.webContents(id);
            return w ? { loading: w.isLoading(), url: w.getURL() } : null;
          }, tab.id);
          if (!wc || wc.loading || !wc.url || wc.url === 'about:blank') return false;
          return (await evaluate(tab, 'document.readyState')) === 'complete';
        },
        { timeout, label: 'Vela load' },
      );
    },
    evaluate,
    async closeTab(tab) {
      mine.delete(tab.id);
      await app.evaluate((_e, id) => globalThis.__vela.ctx.tabs.close(id), tab.id).catch(() => undefined);
    },
    async closeAllMine() {
      for (const id of [...mine]) await this.closeTab({ id });
    },
    async setBounds() {
      await app.evaluate((_e, b) => {
        const win = globalThis.__vela.ctx.windows.main?.win;
        if (win?.isMaximized()) win.unmaximize();
        win?.setBounds(b);
      }, BOUNDS);
    },
    clearCache: async () => undefined,
    activate: () => activate(pid),
    async armSwitch() {
      await app.evaluate(() => {
        const g = globalThis;
        g.__swLog = [];
        if (g.__swHooked) return;
        g.__swHooked = true;
        g.__vela.ctx.tabs.onVisibilityChange((id, visible) => {
          if (!visible) return;
          const shown = Date.now();
          const wc = g.__vela.ctx.tabs.webContents(id);
          void wc
            ?.executeJavaScript(
              'new Promise(r => requestAnimationFrame(() => setTimeout(() => r(Date.now()), 0)))',
              true,
            )
            .then((frame) => g.__swLog.push({ shown, frame }));
        });
      });
    },
    readSwitch: () => app.evaluate(() => globalThis.__swLog),
    async setBlocker(on) {
      await app.evaluate((_e, v) => globalThis.__vela.ctx.blocker.setEnabled(v), on);
      this.name = on ? 'Vela' : 'Vela (blocker off)';
    },
    async close() {
      await app.close().catch(() => undefined);
      if (isAlive(pid)) process.kill(pid, 'SIGKILL');
    },
  };
}
