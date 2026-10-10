import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';
import {
  APP_ROOT,
  activateTab,
  byType,
  coreState,
  launchVela,
  memoryKey,
  memorySample,
  openTab,
  overlayPage,
  perfMarks,
  poll,
  runCommand,
  sumMB,
  waitTabLoaded,
} from './vela.mjs';

export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
export const percentile = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

// Browser-side snippets are strings so this file stays free of DOM globals.
// "Frame committed" = rAF callback then a 0 ms timer, i.e. after that frame's style/layout/paint.
const NEXT_FRAME = 'new Promise(r => requestAnimationFrame(() => setTimeout(() => r(Date.now()), 0)))';
const ARM_COMMAND_INPUT = `window.__perfCmd = new Promise((r) => {
  const sel = '[data-testid="command-input"]';
  if (document.querySelector(sel)) { r(-1); return; }
  const o = new MutationObserver(() => {
    if (!document.querySelector(sel)) return;
    o.disconnect();
    requestAnimationFrame(() => setTimeout(() => r(Date.now()), 0));
  });
  o.observe(document.documentElement, { childList: true, subtree: true });
}); true`;
const COMMAND_INPUT_GONE = '!document.querySelector(\'[data-testid="command-input"]\')';
const RECORD_FRAMES = (ms) => `window.__perfFrames = new Promise((r) => {
  const ts = [];
  const t0 = performance.now();
  const loop = (t) => { ts.push(t); if (t - t0 < ${ms}) requestAnimationFrame(loop); else r(ts); };
  requestAnimationFrame(loop);
}); true`;

/** 1. Cold start: N fresh-profile launches, keeps the last app alive for the next stages. */
export async function measureColdStart(runs = 3) {
  const samples = [];
  let live = null;
  for (let i = 0; i < runs; i++) {
    if (live) await live.close();
    live = await launchVela();
    const m = await perfMarks(live.app);
    samples.push({
      sidebarInteractive: m.sidebarInteractive - m.processStart,
      windowShown: m.windowShown - m.processStart,
      appReady: m.appReady - m.processStart,
      mainStart: m.mainStart - m.processStart,
    });
  }
  const si = samples.map((s) => s.sidebarInteractive);
  const ws = samples.map((s) => s.windowShown);
  return {
    vela: live,
    samples,
    best: Math.min(...si),
    median: median(si),
    windowShownBest: Math.min(...ws),
    windowShownMedian: median(ws),
  };
}

const SHELL = ['Browser', 'Tab'];

/** 2. Shell RAM with zero tabs after a 2 s settle. */
export async function measureShellMemory(app) {
  await sleep(2000);
  const sample = await memorySample(app);
  const key = memoryKey(sample);
  const rss = (types) => sumMB(sample, 'rssMB', types);
  return {
    sample,
    hasFootprint: key === 'footMB',
    shellMB: sumMB(sample, key, SHELL),
    withGpuMB: sumMB(sample, key, [...SHELL, 'GPU']),
    totalMB: sumMB(sample, key),
    rss: { shellMB: rss(SHELL), withGpuMB: rss([...SHELL, 'GPU']), totalMB: rss() },
  };
}

/**
 * 3. Memory saver. `tabs.sleep()` on the *active* tab is immediately undone by reconcile (the
 * active tab always gets a view), so the sleeper is a background tab behind a keeper tab.
 */
export async function measureSleepingTab(app, fixtures) {
  const keeper = await openTab(app, `${fixtures}/page/Keeper`);
  await waitTabLoaded(app, keeper);
  await sleep(1000);
  const baseline = await memorySample(app);

  const sleeper = await openTab(app, `${fixtures}/page/Sleeper`);
  await waitTabLoaded(app, sleeper);
  // Let the GPU go idle first: backgrounding a tab triggers the switcher's `capturePage()` snapshot
  // (150 ms race), which only completes, and only costs main-process memory, when the GPU is free.
  await sleep(2000);
  await activateTab(app, keeper);
  await sleep(1000);
  const withTab = await memorySample(app);

  await app.evaluate((_e, id) => globalThis.__vela.ctx.tabs.sleep(id), sleeper);
  await sleep(1000);
  const after = await memorySample(app);
  const gone = await app.evaluate(
    (_e, id) => globalThis.__vela.ctx.tabs.webContents(id) === undefined,
    sleeper,
  );
  const st = await coreState(app);
  const key = memoryKey(baseline, withTab, after);
  const b = byType(baseline, key);
  const w = byType(withTab, key);
  const a = byType(after, key);
  const deltas = {};
  for (const t of new Set([...Object.keys(b), ...Object.keys(w), ...Object.keys(a)]))
    deltas[t] = { tab: (w[t] ?? 0) - (b[t] ?? 0), residual: (a[t] ?? 0) - (b[t] ?? 0) };
  const total = (s, types) => sumMB(s, key, types);
  const rss = (s) => sumMB(s, 'rssMB');
  // The GPU process swings by ±100 MB on its own (tile cache) over the seconds after a view change,
  // so the gated residual excludes it; the all-process figure is reported alongside.
  const NO_GPU = ['Browser', 'Tab', 'Utility'];
  return {
    hasFootprint: key === 'footMB',
    tabCostMB: total(withTab) - total(baseline),
    freedMB: total(withTab) - total(after),
    residualMB: total(after, NO_GPU) - total(baseline, NO_GPU),
    allResidualMB: total(after) - total(baseline),
    rendererResidualMB: total(after, ['Tab']) - total(baseline, ['Tab']),
    rss: { tabCostMB: rss(withTab) - rss(baseline), residualMB: rss(after) - rss(baseline) },
    byType: deltas,
    webContentsGone: gone,
    sleepingFlag: st.tabs[sleeper]?.sleeping === true,
    counts: {
      baseline: baseline.processes.length,
      withTab: withTab.processes.length,
      after: after.processes.length,
    },
  };
}

/** 4. Tab switch: dispatch `tab/activate` → first committed frame in the activated page. */
export async function measureTabSwitch(app, fixtures, { tabs = 5, switches = 10 } = {}) {
  const ids = [];
  for (let i = 0; i < tabs; i++) {
    const id = await openTab(app, `${fixtures}/page/Switch-${i}`);
    await waitTabLoaded(app, id);
    ids.push(id);
  }
  await sleep(1000);
  const samples = [];
  for (let i = 0; i < switches; i++) {
    const id = ids[(i + 1) % ids.length];
    const r = await app.evaluate(
      async (_e, a) => {
        const g = globalThis.__vela;
        const t0 = Date.now();
        g.ctx.store.dispatch({ type: 'tab/activate', id: a.id, now: t0 });
        const sync = Date.now() - t0;
        const wc = g.ctx.tabs.webContents(a.id);
        const painted = await wc.executeJavaScript(a.snippet, true);
        return { sync, total: painted - t0 };
      },
      { id, snippet: NEXT_FRAME },
    );
    samples.push(r);
    await sleep(150);
  }
  return {
    samples,
    median: median(samples.map((s) => s.total)),
    p95: percentile(
      samples.map((s) => s.total),
      95,
    ),
    syncMedian: median(samples.map((s) => s.sync)),
  };
}

/** 5. Command bar: `overlay.show()` → `[data-testid="command-input"]` committed to a frame. */
export async function measureCommandBar(app, { opens = 10 } = {}) {
  const page = overlayPage(app);
  const samples = [];
  for (let i = 0; i < opens; i++) {
    await page.evaluate(ARM_COMMAND_INPUT);
    const { t0, sync } = await app.evaluate(() => {
      const t0 = Date.now();
      globalThis.__vela.ctx.overlay.show('commandBar', { mode: 'new' });
      return { t0, sync: Date.now() - t0 };
    });
    const rendered = await page.evaluate('window.__perfCmd');
    if (rendered === -1) throw new Error('command bar was already mounted before show()');
    samples.push({ sync, total: rendered - t0 });
    await app.evaluate(() => globalThis.__vela.ctx.overlay.hide());
    await poll(() => page.evaluate(COMMAND_INPUT_GONE), { label: 'command bar hidden' });
    await sleep(100);
  }
  return {
    samples,
    first: samples[0].total,
    median: median(samples.map((s) => s.total)),
    p95: percentile(
      samples.map((s) => s.total),
      95,
    ),
    syncMedian: median(samples.map((s) => s.sync)),
  };
}

async function toggleSidebarTwice(app) {
  await runCommand(app, 'toggleSidebar');
  await sleep(350);
  await runCommand(app, 'toggleSidebar');
  await sleep(350);
}

async function recordToggleFrames(app, shell) {
  await shell.evaluate(RECORD_FRAMES(800));
  await sleep(50);
  await toggleSidebarTwice(app);
  const ts = await shell.evaluate('window.__perfFrames');
  const deltas = ts.slice(1).map((t, i) => t - ts[i]);
  const interval = median(deltas);
  return {
    frames: deltas.length,
    intervalMs: interval,
    hz: Math.round(1000 / interval),
    p50: median(deltas),
    p95: percentile(deltas, 95),
    max: Math.max(...deltas),
    dropped: deltas.reduce((n, d) => n + Math.max(0, Math.round(d / interval) - 1), 0),
  };
}

/**
 * 6. Sidebar toggle animation: rAF frame deltas in the shell over `rounds` pairs of toggles; the
 * round with the median p95 is reported (+ one CDP-traced pair for Layout / long-task counts).
 */
export async function measureAnimation(app, shell, { rounds = 3 } = {}) {
  await sleep(1000);
  const all = [];
  for (let i = 0; i < rounds; i++) all.push(await recordToggleFrames(app, shell));
  const sorted = [...all].sort((a, b) => a.p95 - b.p95);
  const result = { ...sorted[Math.floor(sorted.length / 2)], rounds: all, trace: null };
  try {
    result.trace = await traceToggle(app, shell);
  } catch (err) {
    result.traceError = err instanceof Error ? err.message : String(err);
  }
  return result;
}

async function traceToggle(app, shell) {
  const session = await shell.context().newCDPSession(shell);
  const events = [];
  session.on('Tracing.dataCollected', (e) => events.push(...e.value));
  const done = new Promise((r) => session.once('Tracing.tracingComplete', r));
  await session.send('Tracing.start', {
    categories: 'disabled-by-default-devtools.timeline,devtools.timeline',
    transferMode: 'ReportEvents',
  });
  await toggleSidebarTwice(app);
  await session.send('Tracing.end');
  await done;
  await session.detach().catch(() => undefined);
  const count = (name) => events.filter((e) => e.name === name).length;
  const tasks = events.filter((e) => e.name === 'RunTask' && e.ph === 'X');
  const longTasks = tasks.filter((e) => e.dur > 16_700).length;
  const taskP95 = tasks.length
    ? percentile(
        tasks.map((e) => e.dur / 1000),
        95,
      )
    : 0;
  return {
    events: events.length,
    layout: count('Layout'),
    updateLayoutTree: count('UpdateLayoutTree'),
    paint: count('Paint'),
    tasks: tasks.length,
    longTasks,
    taskP95Ms: taskP95,
  };
}

/** 7. Renderer bundle: gzip size of every emitted JS chunk and of each HTML entry's script set. */
export function measureBundle() {
  const dir = join(APP_ROOT, 'out/renderer');
  const assets = join(dir, 'assets');
  const gz = (file) => gzipSync(readFileSync(join(assets, file))).length;
  const chunks = readdirSync(assets)
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ file: f, raw: readFileSync(join(assets, f)).length, gzip: gz(f) }))
    .sort((a, b) => b.gzip - a.gzip);
  const entries = readdirSync(dir)
    .filter((f) => f.endsWith('.html'))
    .map((html) => {
      const src = readFileSync(join(dir, html), 'utf8');
      const js = [...src.matchAll(/assets\/([\w.-]+\.js)/g)].map((m) => m[1]);
      const css = [...src.matchAll(/assets\/([\w.-]+\.css)/g)].map((m) => m[1]);
      return {
        entry: html,
        js,
        jsGzip: js.reduce((s, f) => s + gz(f), 0),
        cssGzip: css.reduce((s, f) => s + gz(f), 0),
      };
    })
    .sort((a, b) => b.jsGzip - a.jsGzip);
  return {
    chunks,
    entries,
    totalJsGzip: chunks.reduce((s, c) => s + c.gzip, 0),
    largestEntry: entries[0],
  };
}
