import console from 'node:console';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { startFixtureServer } from './fixtures.mjs';
import {
  measureAnimation,
  measureBundle,
  measureColdStart,
  measureCommandBar,
  measureShellMemory,
  measureSleepingTab,
  measureTabSwitch,
} from './metrics.mjs';
import { kb, mb, ms, printTable, renderMarkdown } from './report.mjs';
import { APP_ROOT } from './vela.mjs';

const BUDGET = {
  coldStartMs: 800,
  shellMB: 120,
  sleepResidualMB: 10,
  tabSwitchMs: 50,
  commandBarMs: 16,
  frameP95Ms: 16.7,
  layoutPerFrame: 2,
  bundleGzipBytes: 400 * 1024,
};

const PERF_MD = join(APP_ROOT, '../../PERF.md');

async function stage(name, fn) {
  console.info(`[perf] ${name}…`);
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error(`[perf] ${name} failed: ${message}`);
    return { ok: false, error: message };
  }
}

const fail = (metric, budget, error) => ({
  metric,
  budget,
  measured: `error: ${error.split('\n')[0]}`,
  ok: false,
});

export async function run() {
  const rows = [];
  const details = [];
  let vela = null;
  let fixtures = null;
  let machine = {
    date: new Date().toISOString(),
    cpu: os.cpus()[0]?.model ?? 'unknown',
    cores: os.cpus().length,
    ramGB: Math.round(os.totalmem() / 1024 ** 3),
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    electron: '?',
    chrome: '?',
    node: '?',
    appVersion: JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')).version,
    display: '?',
  };

  const bundle = await stage('bundle size', () => Promise.resolve(measureBundle()));
  if (bundle.ok) {
    const b = bundle.value;
    const largest = b.largestEntry;
    rows.push({
      metric: 'Renderer bundle (largest entry, JS gzip)',
      budget: `< ${kb(BUDGET.bundleGzipBytes)}`,
      measured: `${kb(largest.jsGzip)} (${largest.entry}); all chunks ${kb(b.totalJsGzip)}`,
      ok: largest.jsGzip < BUDGET.bundleGzipBytes,
    });
    details.push({
      title: 'Bundle',
      lines: [
        '| Entry | JS chunks | JS gzip | CSS gzip |',
        '| --- | --- | --- | --- |',
        ...b.entries.map((e) => `| ${e.entry} | ${e.js.join(', ')} | ${kb(e.jsGzip)} | ${kb(e.cssGzip)} |`),
        '',
        '| Chunk | raw | gzip |',
        '| --- | --- | --- |',
        ...b.chunks.map((c) => `| ${c.file} | ${kb(c.raw)} | ${kb(c.gzip)} |`),
      ],
    });
  } else
    rows.push(
      fail('Renderer bundle (largest entry, JS gzip)', `< ${kb(BUDGET.bundleGzipBytes)}`, bundle.error),
    );

  try {
    fixtures = await startFixtureServer();

    const cold = await stage('cold start x3', () => measureColdStart(3));
    if (cold.ok) {
      vela = cold.value.vela;
      const c = cold.value;
      rows.push({
        metric: 'Cold start → sidebar interactive (median of 3)',
        budget: `< ${ms(BUDGET.coldStartMs)}`,
        measured: `${ms(c.median)} (best ${ms(c.best)})`,
        ok: c.median < BUDGET.coldStartMs,
      });
      rows.push({
        metric: 'Cold start → window shown (median of 3)',
        budget: `< ${ms(BUDGET.coldStartMs)}`,
        measured: `${ms(c.windowShownMedian)} (best ${ms(c.windowShownBest)})`,
        ok: c.windowShownMedian < BUDGET.coldStartMs,
      });
      details.push({
        title: 'Cold start',
        lines: [
          'All marks are wall-clock ms since `processStart` (derived from `process.uptime()` in main).',
          '',
          '| Run | main script | app ready | window shown | sidebar interactive |',
          '| --- | --- | --- | --- | --- |',
          ...c.samples.map(
            (s, i) =>
              `| ${i + 1} | ${ms(s.mainStart)} | ${ms(s.appReady)} | ${ms(s.windowShown)} | ${ms(s.sidebarInteractive)} |`,
          ),
        ],
      });
      machine = {
        ...machine,
        ...(await vela.app.evaluate(({ screen }) => ({
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          node: process.versions.node,
          display: (() => {
            const d = screen.getPrimaryDisplay();
            return `${d.size.width}x${d.size.height} @${d.scaleFactor}x, ${Math.round(d.displayFrequency) || '?'} Hz`;
          })(),
        }))),
      };
    } else
      rows.push(
        fail('Cold start → sidebar interactive (median of 3)', `< ${ms(BUDGET.coldStartMs)}`, cold.error),
      );

    if (vela) {
      const mem = await stage('shell memory', () => measureShellMemory(vela.app));
      if (mem.ok) {
        const m = mem.value;
        const unit = m.hasFootprint ? 'footprint' : 'RSS';
        rows.push({
          metric: `Shell RAM, 0 tabs (Browser + renderers, ${unit})`,
          budget: `< ${mb(BUDGET.shellMB)}`,
          measured: `${mb(m.shellMB)} (+GPU ${mb(m.withGpuMB)}, all ${mb(m.totalMB)}; RSS ${mb(m.rss.shellMB)} / +GPU ${mb(m.rss.withGpuMB)})`,
          ok: m.shellMB < BUDGET.shellMB,
        });
        details.push({
          title: 'Shell memory (0 tabs, 2 s after sidebar interactive)',
          lines: [
            '| Process | Type | Footprint (phys) | Working set (RSS) |',
            '| --- | --- | --- | --- |',
            ...m.sample.processes.map(
              (p) =>
                `| ${p.name || '—'} | ${p.type} | ${p.footMB === null ? 'n/a' : mb(p.footMB)} | ${mb(p.rssMB)} |`,
            ),
            '',
            `- Browser + renderers: ${mb(m.shellMB)} ${unit} (RSS ${mb(m.rss.shellMB)})`,
            `- + GPU: ${mb(m.withGpuMB)} ${unit} (RSS ${mb(m.rss.withGpuMB)})`,
            `- all processes: ${mb(m.totalMB)} ${unit} (RSS ${mb(m.rss.totalMB)})`,
          ],
        });
      } else rows.push(fail('Shell RAM, 0 tabs (Browser + renderers)', `< ${mb(BUDGET.shellMB)}`, mem.error));

      const sl = await stage('sleeping tab', () => measureSleepingTab(vela.app, fixtures.url));
      if (sl.ok) {
        const s = sl.value;
        const unit = s.hasFootprint ? 'footprint' : 'RSS';
        rows.push({
          metric: `Sleeping tab residual (excl. GPU, ${unit})`,
          budget: `≈ 0 MB (< ${mb(BUDGET.sleepResidualMB)}), WebContents destroyed`,
          measured: `${mb(s.residualMB)} residual (all processes ${mb(s.allResidualMB)}; tab cost ${mb(s.tabCostMB)}, freed ${mb(s.freedMB)}), webContents gone: ${s.webContentsGone}`,
          ok: s.residualMB < BUDGET.sleepResidualMB && s.webContentsGone && s.sleepingFlag,
        });
        details.push({
          title: 'Sleeping tab',
          lines: [
            `- Tab cost (loaded background tab): ${mb(s.tabCostMB)} ${unit} (RSS ${mb(s.rss.tabCostMB)})`,
            `- Freed by \`tabs.sleep()\`: ${mb(s.freedMB)}`,
            `- Residual vs baseline: ${mb(s.residualMB)} excluding GPU (gated); all processes ${mb(s.allResidualMB)} (RSS ${mb(s.rss.residualMB)}); renderer processes only: ${mb(s.rendererResidualMB)}`,
            `- \`tabs.webContents(id) === undefined\`: ${s.webContentsGone}; state \`sleeping\`: ${s.sleepingFlag}`,
            `- Process count baseline / with tab / after sleep: ${s.counts.baseline} / ${s.counts.withTab} / ${s.counts.after}`,
            '',
            `| Process type | Δ with tab | Δ residual after sleep |`,
            '| --- | --- | --- |',
            ...Object.entries(s.byType).map(([t, d]) => `| ${t} | ${mb(d.tab)} | ${mb(d.residual)} |`),
          ],
        });
      } else rows.push(fail('Sleeping tab residual (excl. GPU)', '≈ 0 MB', sl.error));

      const sw = await stage('tab switch x10', () => measureTabSwitch(vela.app, fixtures.url));
      if (sw.ok) {
        const s = sw.value;
        rows.push({
          metric: 'Tab switch → first frame (median of 10)',
          budget: `< ${ms(BUDGET.tabSwitchMs)}`,
          measured: `${ms(s.median)} (p95 ${ms(s.p95)}, dispatch+layout ${ms(s.syncMedian)})`,
          ok: s.median < BUDGET.tabSwitchMs,
        });
        details.push({
          title: 'Tab switch',
          lines: [
            'Five fixture tabs; each switch activates a detached tab. `sync` = synchronous `store.dispatch` (reconcile + attach + layout); `total` = dispatch → first committed frame in the activated page.',
            '',
            `- samples (ms): ${s.samples.map((x) => x.total).join(', ')}`,
            `- sync (ms): ${s.samples.map((x) => x.sync).join(', ')}`,
          ],
        });
      } else
        rows.push(fail('Tab switch → first frame (median of 10)', `< ${ms(BUDGET.tabSwitchMs)}`, sw.error));

      const cb = await stage('command bar x10', () => measureCommandBar(vela.app));
      if (cb.ok) {
        const c = cb.value;
        rows.push({
          metric: 'Command bar open → input rendered (median of 10)',
          budget: `< ${ms(BUDGET.commandBarMs)}`,
          measured: `${ms(c.median)} (first ${ms(c.first)}, p95 ${ms(c.p95)}, show() ${ms(c.syncMedian)})`,
          ok: c.median < BUDGET.commandBarMs,
        });
        details.push({
          title: 'Command bar',
          lines: [
            '`overlay.show("commandBar")` in main → `[data-testid="command-input"]` observed in the overlay DOM and committed to a frame.',
            '',
            `- samples (ms): ${c.samples.map((x) => x.total).join(', ')}`,
            `- show() sync (ms): ${c.samples.map((x) => x.sync).join(', ')}`,
          ],
        });
      } else
        rows.push(
          fail('Command bar open → input rendered (median of 10)', `< ${ms(BUDGET.commandBarMs)}`, cb.error),
        );

      const an = await stage('sidebar animation', () => measureAnimation(vela.app, vela.shell));
      if (an.ok) {
        const a = an.value;
        const t = a.trace;
        const layoutPerFrame = t ? t.layout / Math.max(1, a.frames) : 0;
        rows.push({
          metric: 'Sidebar toggle animation, frame time p95',
          budget: `≤ ${ms(BUDGET.frameP95Ms)}, < ${BUDGET.layoutPerFrame} Layout/frame`,
          measured: `${ms(a.p95)} (${a.hz} Hz display, ${a.dropped} dropped of ${a.frames}${t ? `, ${t.layout} Layout / ${t.longTasks} long tasks` : ', no trace'})`,
          ok: a.p95 <= BUDGET.frameP95Ms && layoutPerFrame < BUDGET.layoutPerFrame,
        });
        details.push({
          title: 'Sidebar animation',
          lines: [
            `- rAF frames recorded over 800 ms spanning two toggles, median round of ${a.rounds.length}: ${a.frames} frames; median interval ${ms(a.intervalMs)} (${a.hz} Hz)`,
            `- frame time p50 ${ms(a.p50)}, p95 ${ms(a.p95)}, max ${ms(a.max)}, dropped frames ${a.dropped}`,
            `- per round p95 / max / dropped: ${a.rounds.map((r) => `${ms(r.p95)} / ${ms(r.max)} / ${r.dropped}`).join('; ')}`,
            t
              ? `- CDP timeline (second pair of toggles): ${t.events} events, Layout ${t.layout}, UpdateLayoutTree ${t.updateLayoutTree}, Paint ${t.paint}, tasks ${t.tasks} (long > 16.7 ms: ${t.longTasks}, task p95 ${ms(t.taskP95Ms)})`
              : `- CDP timeline unavailable: ${a.traceError ?? 'unknown'}`,
          ],
        });
      } else
        rows.push(fail('Sidebar toggle animation, frame time p95', `≤ ${ms(BUDGET.frameP95Ms)}`, an.error));
    }
  } finally {
    if (vela) await vela.close();
    fixtures?.server.close();
  }

  const methodology = [
    '- Built app (`electron-vite build`) launched headed through Playwright `_electron` with `VELA_E2E=1` and a fresh `VELA_USER_DATA` per launch; measurements read from `globalThis.__vela` in the main process.',
    '- Cold start: three launches; marks are `Date.now()` in main (`processStart` = now − `process.uptime()`), `sidebarInteractive` is sent by the React shell once hydrated.',
    '- Memory: `app.getAppMetrics()` lists the processes; on macOS each pid is also read with `/usr/bin/footprint` (`phys_footprint`, the number Activity Monitor shows) because `workingSetSize` is RSS there and re-counts the shared Electron framework pages in every process. Budgets are gated on footprint when available, RSS otherwise; both are reported. "Shell" = Browser + every renderer (`Tab`) process alive with zero tabs, i.e. shell + overlay.',
    '- Sleeping tab: keeper tab opened first (baseline), sleeper opened then backgrounded, `tabs.sleep()` destroys its WebContents; residual = memory 1 s after sleep − baseline, summed over Browser + renderer + utility processes (the GPU process cache swings by ±100 MB on its own and is reported separately).',
    '- Tab switch: `store.dispatch(tab/activate)` in main, then `executeJavaScript` in the activated page waits for `requestAnimationFrame` + a 0 ms timer (frame committed). Median of 10 switches across 5 tabs.',
    '- Command bar: a MutationObserver armed in the overlay page resolves when `[data-testid="command-input"]` appears and the next frame commits; timed from `overlay.show()` in main. Median of 10.',
    '- Animation: `requestAnimationFrame` deltas recorded in the shell page across two `toggleSidebar` commands (220 ms motion each); dropped = frames longer than the display interval. A second pair is traced through CDP `Tracing` to count Layout / long tasks.',
    '- Bundle: gzip (zlib default level) of every `out/renderer/assets/*.js`; per-entry totals from the scripts referenced by each `out/renderer/*.html`.',
  ];

  printTable(rows);
  writeFileSync(PERF_MD, renderMarkdown({ rows, machine, details, methodology }));
  console.info(`[perf] wrote ${PERF_MD}`);
  const failed = rows.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`[perf] ${failed.length} budget(s) failed:`);
    for (const r of failed) console.error(`  - ${r.metric}: ${r.measured} (budget ${r.budget})`);
    return 1;
  }
  console.info('[perf] all budgets met');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await run();
}
