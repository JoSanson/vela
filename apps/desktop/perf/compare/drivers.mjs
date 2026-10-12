import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { activate, isAlive, waitExit } from './system.mjs';
import { APP_ROOT } from '../vela.mjs';

export const ARC_BIN = '/Applications/Arc.app/Contents/MacOS/Arc';
// VELA_BIN overrides the packaged app to measure (e.g. a build in another output directory).
export const VELA_BIN =
  process.env.VELA_BIN ?? join(APP_ROOT, 'release/mac-arm64/Vela.app/Contents/MacOS/Vela');
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
 * The packaged Vela.app (the binary users run) on a fresh profile, driven exactly like Arc: raw CDP
 * (`--remote-debugging-port`), no Playwright. Playwright attaches to every page and keeps them
 * "visible" and focused, which disables Chromium's background throttling and skews CPU, memory and
 * tab-switch numbers. Tabs are opened and closed through the shell's own `window.vela` bridge.
 */
export async function startVela({ blocker = true, port = 9445 } = {}) {
  const userData = mkdtempSync(join(tmpdir(), 'vela-vs-arc-'));
  const windowBounds = { x: BOUNDS.x, y: BOUNDS.y, width: BOUNDS.width, height: BOUNDS.height };
  writeFileSync(
    join(userData, 'prefs.json'),
    JSON.stringify({ onboardingDone: true, blockerEnabled: blocker, windowBounds }),
  );
  const child = spawn(VELA_BIN, [`--remote-debugging-port=${port}`], {
    env: { ...process.env, VELA_USER_DATA: userData },
    stdio: 'ignore',
  });
  const version = await poll(
    async () => (await globalThis.fetch(`http://127.0.0.1:${port}/json/version`)).json(),
    {
      label: 'Vela CDP',
    },
  );
  const cdp = new Cdp(version.webSocketDebuggerUrl);
  await cdp.open();
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
  const shellTarget = await poll(
    async () => (await pages()).find((t) => /\/renderer\/index\.html/.test(t.url)) ?? null,
    { label: 'Vela shell' },
  );
  await poll(
    async () =>
      (await evaluate(shellTarget.targetId, `!!document.querySelector('[data-ready="true"]')`)) === true,
    {
      label: 'Vela ready',
    },
  );
  const shellCall = (ch, req) =>
    evaluate(
      shellTarget.targetId,
      `window.vela.invoke(${JSON.stringify(ch)}, ${JSON.stringify(req ?? null)})`,
    );
  const isTabTarget = (t) => !/\/renderer\/|^vela:|^devtools:|^chrome-extension:/.test(t.url);
  const electronVersion = execFileSync(
    'defaults',
    [
      'read',
      join(VELA_BIN, '../../Frameworks/Electron Framework.framework/Resources/Info.plist'),
      'CFBundleVersion',
    ],
    { encoding: 'utf8' },
  ).trim();
  const mine = new Map();
  return {
    name: blocker ? 'Vela' : 'Vela (blocker off)',
    version: JSON.parse(
      execFileSync('plutil', ['-convert', 'json', '-o', '-', join(VELA_BIN, '../../Info.plist')], {
        encoding: 'utf8',
      }),
    ).CFBundleShortVersionString,
    chromium: `${version.Browser} (Electron ${electronVersion})`,
    pid: child.pid,
    userData,
    preexistingPages: 0,
    async openTab(url) {
      const before = new Set((await pages()).map((t) => t.targetId));
      const t0 = Date.now();
      const tabId = await shellCall('tab/openUrl', { input: url, noAtc: true });
      const target = await poll(
        async () => (await pages()).find((t) => !before.has(t.targetId) && isTabTarget(t)) ?? null,
        {
          label: 'Vela tab target',
        },
      );
      mine.set(target.targetId, tabId);
      return { id: target.targetId, tabId, t0 };
    },
    async waitLoaded(tab, timeout = 30_000) {
      await poll(async () => (await evaluate(tab.id, 'document.readyState')) === 'complete', {
        timeout,
        label: 'Vela load',
      });
    },
    evaluate: (tab, expr) => evaluate(tab.id, expr),
    async closeTab(tab) {
      const tabId = tab.tabId ?? mine.get(tab.id);
      sessions.delete(tab.id);
      mine.delete(tab.id);
      if (tabId) await shellCall('tab/close', { tabId }).catch(() => undefined);
    },
    async closeAllMine() {
      for (const [targetId, tabId] of [...mine]) await this.closeTab({ id: targetId, tabId });
    },
    setBounds: async () => undefined,
    clearCache: async () => undefined,
    activate: () => activate(child.pid),
    async setBlocker(on) {
      await shellCall('prefs/set', { blockerEnabled: on });
      this.name = on ? 'Vela' : 'Vela (blocker off)';
    },
    async armSwitch(tabs, probe) {
      for (const t of tabs) await evaluate(t.id, probe);
    },
    async readSwitch(tabs) {
      const all = [];
      for (const t of tabs) all.push(...(await evaluate(t.id, 'window.__sw')));
      return all;
    },
    async close() {
      cdp.close();
      child.kill('SIGTERM');
      await waitExit(child.pid, 20_000);
      if (isAlive(child.pid)) process.kill(child.pid, 'SIGKILL');
    },
  };
}
