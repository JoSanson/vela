import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

export const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MAIN_ENTRY = join(APP_ROOT, 'out/main/index.js');

export async function poll(fn, { timeout = 15_000, interval = 25, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(interval);
  }
}

export const perfMarks = (app) => app.evaluate(() => ({ ...globalThis.__vela.ctx.perf }));
export const appMetrics = (app) => app.evaluate(({ app: a }) => a.getAppMetrics());
export const coreState = (app) =>
  app.evaluate(() => JSON.parse(JSON.stringify(globalThis.__vela.ctx.store.state)));
export const runCommand = (app, id, payload) =>
  app.evaluate((_e, a) => globalThis.__vela.runCommand(a.id, a.payload), { id, payload });

export const overlayPage = (app) => app.windows().find((w) => w.url().includes('overlay.html'));

/** Cold launch with a fresh profile; resolves once the React shell reported `sidebarInteractive`. */
export async function launchVela({ args = [] } = {}) {
  const userData = mkdtempSync(join(tmpdir(), 'vela-perf-'));
  const app = await electron.launch({
    args: [MAIN_ENTRY, ...args],
    env: { ...process.env, VELA_USER_DATA: userData, VELA_E2E: '1', ELECTRON_ENABLE_LOGGING: '0' },
    timeout: 30_000,
  });
  const shell = await app.firstWindow();
  await shell.waitForSelector('[data-ready="true"]', { timeout: 15_000 });
  await poll(() => overlayPage(app), { label: 'overlay page' });
  await poll(async () => (await perfMarks(app)).sidebarInteractive !== undefined, {
    label: 'sidebarInteractive mark',
  });
  const close = async () => {
    await app.close().catch(() => undefined);
    rmSync(userData, { recursive: true, force: true });
  };
  return { app, shell, userData, close };
}

export const openTab = (app, url) =>
  app.evaluate((_e, input) => globalThis.__vela.ctx.tabs.openUrl({ input, noAtc: true }), url);

export const activateTab = (app, id) =>
  app.evaluate((_e, a) => {
    globalThis.__vela.ctx.store.dispatch({ type: 'tab/activate', id: a, now: Date.now() });
  }, id);

export async function waitTabLoaded(app, id) {
  await poll(
    () =>
      app.evaluate((_e, a) => {
        const wc = globalThis.__vela.ctx.tabs.webContents(a);
        return !!wc && !wc.isLoading() && wc.getURL().includes('/page/');
      }, id),
    { label: `tab ${id} loaded` },
  );
}

/**
 * macOS `phys_footprint` per pid (what Activity Monitor shows). `workingSetSize` is RSS there and
 * counts the shared Electron framework pages once per process, so summing it overstates by ~3x.
 */
export function footprintOf(pid) {
  if (process.platform !== 'darwin') return null;
  try {
    const out = execFileSync('/usr/bin/footprint', ['-f', 'bytes', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const m = /phys_footprint:\s+(\d+) B/.exec(out);
    return m ? Number(m[1]) / 1024 ** 2 : null;
  } catch {
    return null;
  }
}

/** One memory sample: Electron metrics per process plus footprint when the platform provides it. */
export async function memorySample(app) {
  const metrics = await appMetrics(app);
  const processes = metrics.map((m) => ({
    pid: m.pid,
    type: m.type,
    name: m.name ?? m.serviceName ?? '',
    rssMB: m.memory.workingSetSize / 1024,
    footMB: footprintOf(m.pid),
  }));
  return { processes, hasFootprint: processes.every((p) => p.footMB !== null) };
}

/** Sum of one memory key over the processes of the given types (all types when omitted). */
export const sumMB = (sample, key, types) =>
  sample.processes.filter((p) => !types || types.includes(p.type)).reduce((s, p) => s + (p[key] ?? 0), 0);

/** Footprint when every process of every sample has one (macOS), RSS otherwise. */
export const memoryKey = (...samples) => (samples.every((s) => s.hasFootprint) ? 'footMB' : 'rssMB');

export const byType = (sample, key = 'rssMB') => {
  const out = {};
  for (const p of sample.processes) out[p.type] = (out[p.type] ?? 0) + (p[key] ?? 0);
  return out;
};
