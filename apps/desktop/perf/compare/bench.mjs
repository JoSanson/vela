// Arc vs Vela, same machine, same harness, same probes. `node perf/compare/bench.mjs [phases...]`
// Phases: startup memory loads switch (default: all). Raw results → perf/compare/results.json.
// Run under `caffeinate -dimsu -t 3600`: an idle lock occludes the windows and voids every number.
import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import { join, dirname } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { startFixtureServer } from '../fixtures.mjs';
import { ARC_BIN, BOUNDS, VELA_BIN, arcPid, quitArc, startArc, startVela } from './drivers.mjs';
import { assertUnlocked, cpuOf, cpuOver, jxa, median, memoryOf, waitExit } from './system.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'results.json');
const phases = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['startup', 'memory', 'loads', 'switch'];
const results = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const save = () => writeFileSync(OUT, JSON.stringify(results, null, 2));
const log = (...a) => console.info(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

const SITES = [
  'https://fr.wikipedia.org/wiki/Navigateur_web',
  'https://github.com/electron/electron',
  'https://www.lemonde.fr/',
  'https://www.youtube.com/',
  'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
];
const MEMORY_SITES = [
  ...SITES,
  'https://news.ycombinator.com/',
  'https://www.bbc.com/news',
  'https://stackoverflow.com/questions',
  'https://www.reddit.com/r/programming/',
  'https://www.apple.com/fr/',
];

// In-page probe, identical in both browsers. Times are ms since the page's navigation start, plus
// `timeOrigin` (wall clock) so "open command → first paint" includes the browser's own overhead.
const PAGE_METRICS = `(async () => {
  const nav = performance.getEntriesByType('navigation')[0];
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];
  const lcp = await new Promise((r) => {
    let v = null;
    try {
      new PerformanceObserver((l) => { const e = l.getEntries(); v = e[e.length - 1].startTime; })
        .observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}
    setTimeout(() => r(v), 150);
  });
  const res = performance.getEntriesByType('resource');
  return {
    timeOrigin: performance.timeOrigin,
    ttfb: nav?.responseStart ?? null,
    dcl: nav?.domContentLoadedEventEnd ?? null,
    load: nav?.loadEventEnd ?? null,
    fcp: fcp?.startTime ?? null,
    lcp,
    requests: res.length + 1,
    kb: (res.reduce((s, r) => s + (r.transferSize || 0), 0) + (nav?.transferSize || 0)) / 1024,
    visibility: document.visibilityState,
  };
})()`;

// visibilitychange→visible in the page, then the next committed frame. Same probe in both browsers.
const SWITCH_PROBE = `(() => {
  window.__sw = [];
  const mark = () => {
    const shown = Date.now();
    requestAnimationFrame(() => setTimeout(() => window.__sw.push({ shown, frame: Date.now() }), 0));
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') mark(); });
  return true;
})()`;

const finderPid = () => execFileSync('pgrep', ['-x', 'Finder'], { encoding: 'utf8' }).trim().split('\n')[0];

const machine = () => ({
  cpu: os.cpus()[0]?.model,
  cores: os.cpus().length,
  ramGB: Math.round(os.totalmem() / 1024 ** 3),
  os: `${os.type()} ${os.release()}`,
  date: new Date().toISOString(),
});

/** 1. Launch → first on-screen window, by the WindowServer, plus CPU burnt over the first 10 s. */
async function phaseStartup(runs = 5) {
  log('startup: preparing Vela profile');
  const velaData = mkdtempSync(join(os.tmpdir(), 'vela-vs-arc-start-'));
  writeFileSync(join(velaData, 'prefs.json'), JSON.stringify({ onboardingDone: true }));
  const cfg = {
    Arc: { bin: ARC_BIN, env: {}, quit: quitArc },
    Vela: {
      bin: VELA_BIN,
      env: { VELA_USER_DATA: velaData },
      quit: async (pid) => {
        process.kill(pid, 'SIGTERM');
        await waitExit(pid, 20_000);
        await sleep(1500);
      },
    },
  };
  await quitArc();
  const samples = { Arc: [], Vela: [] };
  // Run 0 of each is a warm-up (disk cache, profile creation) and is discarded.
  for (let i = 0; i <= runs; i++) {
    for (const name of i % 2 ? ['Arc', 'Vela'] : ['Vela', 'Arc']) {
      const c = cfg[name];
      const r = JSON.parse(await jxa('launch.js', [30_000, JSON.stringify(c.env), c.bin]));
      const { pid } = r;
      await sleep(10_000 - (Date.now() - r.t0));
      const cpuSec = cpuOf(pid);
      const mem = await memoryOf(pid);
      log(
        `startup ${name} #${i}: window ${r.windowMs} ms, cpu ${cpuSec.toFixed(2)} s, mem ${mem.totalMB.toFixed(0)} MB`,
      );
      if (i > 0)
        samples[name].push({
          windowMs: r.windowMs,
          cpuSec10s: cpuSec,
          memMB10s: mem.totalMB,
          procs: mem.processes,
          byRole: mem.byRole,
        });
      await c.quit(pid);
    }
  }
  rmSync(velaData, { recursive: true, force: true });
  results.startup = samples;
  save();
}

async function settle(b, ms) {
  await b.activate();
  await sleep(ms);
}

/** 2. Memory: 1 local tab → 10 real sites → idle CPU → close them all (reclaim). */
async function memoryRun(b, fixtures) {
  await b.setBounds();
  await settle(b, 5000);
  const base = await b.openTab(`${fixtures}/page/Baseline`);
  await b.waitLoaded(base);
  await settle(b, 8000);
  const m1 = await memoryOf(b.pid);
  log(`${b.name}: 1 tab ${m1.totalMB.toFixed(0)} MB`);
  const tabs = [];
  for (const url of MEMORY_SITES) {
    const t = await b.openTab(url);
    await b.waitLoaded(t, 45_000).catch((e) => log(`  ${url}: ${e.message}`));
    await sleep(2000);
    tabs.push(t);
  }
  await settle(b, 15_000);
  await assertUnlocked('memory');
  const m11 = await memoryOf(b.pid);
  log(`${b.name}: 11 tabs ${m11.totalMB.toFixed(0)} MB (${m11.processes} procs)`);
  const cpuFg = await cpuOver(b.pid, 30_000);
  log(`${b.name}: idle CPU (foreground, 11 tabs) ${cpuFg.pct.toFixed(1)} %`);
  // Finder to the front sends the browser to the background (occluded, as in real use).
  await jxa('activate.js', [finderPid()]);
  await sleep(3000);
  const cpuBg = await cpuOver(b.pid, 30_000);
  log(`${b.name}: idle CPU (background, 11 tabs) ${cpuBg.pct.toFixed(1)} %`);
  for (const t of tabs) await b.closeTab(t);
  await settle(b, 15_000);
  const mAfter = await memoryOf(b.pid);
  log(`${b.name}: after closing 10 ${mAfter.totalMB.toFixed(0)} MB`);
  await b.closeTab(base);
  const strip = (m) => ({ totalMB: m.totalMB, processes: m.processes, byRole: m.byRole });
  return { oneTab: strip(m1), elevenTabs: strip(m11), afterClose: strip(mAfter), cpuFg, cpuBg };
}

async function phaseMemory(fixtures) {
  const out = {};
  for (const [start, key] of [
    [() => startVela({ blocker: true }), 'Vela'],
    [() => startVela({ blocker: false }), 'Vela (blocker off)'],
    [() => startArc(), 'Arc'],
  ]) {
    const b = await start();
    out[key] = await memoryRun(b, fixtures);
    results.versions = {
      ...results.versions,
      [b.name.startsWith('Vela') ? 'Vela' : 'Arc']: { version: b.version, chromium: b.chromium },
    };
    await b.close();
    save();
  }
  results.memory = out;
  save();
}

/** 3. Page loads, both browsers up, ABBA-alternated per page so network drift hits both equally. */
async function phaseLoads(fixtures, rounds = 5) {
  const arc = await startArc();
  await arc.clearCache();
  const vela = await startVela({ blocker: true });
  await arc.setBounds();
  await vela.setBounds();
  const configs = [
    { key: 'Arc', b: arc, prep: async () => undefined },
    { key: 'Vela', b: vela, prep: () => vela.setBlocker(true) },
    { key: 'Vela (blocker off)', b: vela, prep: () => vela.setBlocker(false) },
  ];
  const pages = [`${fixtures}/page/Local-fixture`, ...SITES];
  const samples = [];
  for (let r = 0; r < rounds; r++) {
    for (const [pi, url] of pages.entries()) {
      const order = (r + pi) % 2 ? [...configs].reverse() : configs;
      for (const c of order) {
        await c.prep();
        await c.b.activate();
        await sleep(400);
        const t = await c.b.openTab(url);
        let ok = true;
        await c.b.waitLoaded(t, 45_000).catch(() => (ok = false));
        const loadedWall = Date.now();
        await sleep(3000);
        const m = ok ? await c.b.evaluate(t, PAGE_METRICS).catch(() => null) : null;
        if (m) {
          m.openToFcp = m.fcp == null ? null : m.timeOrigin + m.fcp - t.t0;
          m.openToLoad = m.timeOrigin + m.load - t.t0;
          m.openToReadyPoll = loadedWall - t.t0;
        }
        await assertUnlocked('page loads');
        samples.push({ round: r, url, browser: c.key, ok, ...m });
        log(
          `loads r${r} ${c.key.padEnd(18)} ${url.replace(fixtures, 'local').padEnd(56)} fcp ${m?.fcp?.toFixed(0)} load ${m?.load?.toFixed(0)} open→fcp ${m?.openToFcp?.toFixed(0)}`,
        );
        await c.b.closeTab(t);
        await sleep(500);
      }
    }
    results.loads = samples;
    save();
  }
  await vela.close();
  await arc.close();
}

/** 4. Tab switch with a real keystroke (Cmd+Option+Up/Down, same shortcut in both) → first frame. */
const UP = 126;
const DOWN = 125;

async function switchRun(b, fixtures) {
  await b.setBounds();
  const tabs = [];
  for (let i = 0; i < 6; i++) {
    const t = await b.openTab(`${fixtures}/page/Switch-${i}`);
    await b.waitLoaded(t);
    tabs.push(t);
  }
  await b.armSwitch(tabs, SWITCH_PROBE);
  await settle(b, 1000);
  // Click into the page (right half of the window, clear of both sidebars) so keyboard focus is in
  // web content, as when a user is reading a page, not in the address bar of the new tab.
  await jxa('click.js', [BOUNDS.x + BOUNDS.width * 0.75, BOUNDS.y + BOUNDS.height * 0.6]);
  await sleep(1000);
  // Both put new tabs on top: from the newest, walk down to the oldest and back up, twice, so every
  // press lands on one of our tabs.
  const seq = [...Array(5).fill(DOWN), ...Array(5).fill(UP), ...Array(5).fill(DOWN), ...Array(5).fill(UP)];
  await assertUnlocked('tab switch');
  const posts = (await jxa('keys.js', [b.pid, 500, seq.join(',')])).split(' ').map(Number);
  await assertUnlocked('tab switch');
  await sleep(800);
  const frames = await b.readSwitch(tabs);
  frames.sort((x, y) => x.shown - y.shown);
  const samples = [];
  for (const [i, p] of posts.entries()) {
    const next = posts[i + 1] ?? Infinity;
    const f = frames.find((x) => x.shown >= p && x.shown < next);
    if (f) samples.push({ visible: f.shown - p, frame: f.frame - p });
  }
  log(
    `${b.name}: ${samples.length}/${posts.length} switches, median ${median(samples.map((s) => s.frame))} ms`,
  );
  for (const t of tabs) await b.closeTab(t);
  return { posts: posts.length, samples };
}

async function phaseSwitch(fixtures, rounds = 3) {
  const out = {};
  for (const [start, key] of [
    [() => startVela(), 'Vela'],
    [() => startArc(), 'Arc'],
  ]) {
    const b = await start();
    const runs = [];
    for (let r = 0; r < rounds; r++) runs.push(await switchRun(b, fixtures));
    out[key] = {
      posts: runs.reduce((s, x) => s + x.posts, 0),
      samples: runs.flatMap((x) => x.samples),
      perRound: runs.map((x) => x.samples.length),
    };
    await b.close();
  }
  results.switch = out;
  save();
}

const { server, url: fixtures } = await startFixtureServer();
results.machine = machine();
try {
  if (phases.includes('startup')) await phaseStartup();
  if (phases.includes('memory')) await phaseMemory(fixtures);
  if (phases.includes('loads')) await phaseLoads(fixtures);
  if (phases.includes('switch')) await phaseSwitch(fixtures);
} finally {
  server.close();
  save();
  if (arcPid()) log('Arc still running (left for the user)');
}
log('done →', OUT);
process.exit(0);
