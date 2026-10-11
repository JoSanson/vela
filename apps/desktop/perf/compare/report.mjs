// results.json → markdown tables (stdout). `node perf/compare/report.mjs > report.md`
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { median, percentile } from './system.mjs';

const r = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'results.json'), 'utf8'));
const lines = [];
const p = (s = '') => lines.push(s);
const f0 = (v) => (v == null ? '—' : v.toFixed(0));
const f1 = (v) => (v == null ? '—' : v.toFixed(1));
const ratio = (a, b) => (a == null || b == null || b === 0 ? '—' : `${(a / b).toFixed(2)}×`);
const table = (head, rows) => {
  p(`| ${head.join(' | ')} |`);
  p(`| ${head.map(() => '---').join(' | ')} |`);
  for (const row of rows) p(`| ${row.join(' | ')} |`);
  p();
};

p('# Arc vs Vela — benchmark');
p();
p(
  `Machine: ${r.machine.cpu} (${r.machine.cores} cores), ${r.machine.ramGB} GB, ${r.machine.os}. Run ${r.machine.date}.`,
);
if (r.versions)
  p(
    `Arc ${r.versions.Arc?.version} (${r.versions.Arc?.chromium}) · Vela ${r.versions.Vela?.version} (${r.versions.Vela?.chromium}).`,
  );
p();

if (r.startup) {
  p('## Startup (launch → first window on screen, WindowServer)');
  const s = r.startup;
  const col = (k, key) => s[k].map((x) => x[key]);
  table(
    ['Metric', 'Arc', 'Vela', 'Vela / Arc'],
    [
      [
        'Window on screen, median (ms)',
        f0(median(col('Arc', 'windowMs'))),
        f0(median(col('Vela', 'windowMs'))),
        ratio(median(col('Vela', 'windowMs')), median(col('Arc', 'windowMs'))),
      ],
      [
        'Window on screen, runs (ms)',
        col('Arc', 'windowMs').join(', '),
        col('Vela', 'windowMs').join(', '),
        '',
      ],
      [
        'CPU burnt in first 10 s (s)',
        f1(median(col('Arc', 'cpuSec10s'))),
        f1(median(col('Vela', 'cpuSec10s'))),
        ratio(median(col('Vela', 'cpuSec10s')), median(col('Arc', 'cpuSec10s'))),
      ],
      [
        'Memory at 10 s (MB)',
        f0(median(col('Arc', 'memMB10s'))),
        f0(median(col('Vela', 'memMB10s'))),
        ratio(median(col('Vela', 'memMB10s')), median(col('Arc', 'memMB10s'))),
      ],
      ['Processes at 10 s', f0(median(col('Arc', 'procs'))), f0(median(col('Vela', 'procs'))), ''],
    ],
  );
}

if (r.memory) {
  p('## Memory (phys_footprint, whole process tree) and idle CPU');
  const m = r.memory;
  const keys = Object.keys(m);
  const row = (label, fn) => [label, ...keys.map((k) => fn(m[k]))];
  table(
    ['Metric', ...keys],
    [
      row('1 local tab (MB)', (x) => f0(x.oneTab.totalMB)),
      row('11 tabs: 1 local + 10 real sites (MB)', (x) => f0(x.elevenTabs.totalMB)),
      row('Cost of the 10 real sites (MB)', (x) => f0(x.elevenTabs.totalMB - x.oneTab.totalMB)),
      row('After closing the 10 (MB)', (x) => f0(x.afterClose.totalMB)),
      row('Processes with 11 tabs', (x) => f0(x.elevenTabs.processes)),
      row('Idle CPU, 11 tabs, app active (% of a core)', (x) => f1(x.cpuFg.pct)),
      row('Idle CPU, 11 tabs, app inactive (% of a core)', (x) => f1(x.cpuBg.pct)),
    ],
  );
  p('Breakdown with 11 tabs (MB):');
  p();
  const roles = [...new Set(keys.flatMap((k) => Object.keys(m[k].elevenTabs.byRole)))];
  table(
    ['Process role', ...keys],
    roles.map((role) => [role, ...keys.map((k) => f0(m[k].elevenTabs.byRole[role] ?? 0))]),
  );
}

if (r.loads) {
  p('## Page loads (ms, median of rounds 1-4 = warm HTTP cache; round 0 = first visit, shown apart)');
  p(
    'In-page Navigation/Paint Timing, identical probe. "open→FCP" is wall clock from the open-tab call to first contentful paint, so it includes the browser\'s own tab/process creation.',
  );
  p();
  // A sample whose page was not visible (window not yet frontmost) has throttled paints: dropped.
  const valid = r.loads.filter((x) => x.ok && x.fcp != null && x.visibility !== 'hidden');
  const ok = valid.filter((x) => x.round > 0);
  const browsers = ['Arc', 'Vela', 'Vela (blocker off)'];
  const urls = [...new Set(r.loads.map((x) => x.url))];
  const short = (u) => (u.includes('127.0.0.1') ? 'local fixture' : new URL(u).hostname.replace('www.', ''));
  for (const metric of ['openToFcp', 'fcp', 'lcp', 'load']) {
    p(`### ${metric === 'openToFcp' ? 'open → FCP' : metric.toUpperCase()}`);
    p();
    table(
      ['Page', ...browsers, ...browsers.map((b) => `${b}, 1st visit`)],
      urls.map((u) => [
        short(u),
        ...browsers.map((b) =>
          f0(
            median(
              ok.filter((x) => x.url === u && x.browser === b && x[metric] != null).map((x) => x[metric]),
            ),
          ),
        ),
        ...browsers.map((b) =>
          f0(valid.find((x) => x.round === 0 && x.url === u && x.browser === b)?.[metric]),
        ),
      ]),
    );
  }
  p('### Requests per page (same counts = the blocker removed little on these five)');
  p();
  table(
    ['Page', ...browsers],
    urls.map((u) => [
      short(u),
      ...browsers.map((b) =>
        f0(median(ok.filter((x) => x.url === u && x.browser === b).map((x) => x.requests))),
      ),
    ]),
  );
  const failed = r.loads.filter((x) => !x.ok || x.fcp == null || x.visibility === 'hidden');
  if (failed.length)
    p(
      `Failed or no-FCP samples: ${failed.map((x) => `${x.browser} ${short(x.url)} r${x.round}`).join(', ')}`,
    );
  p();
}

if (r.switch) {
  p('## Tab switch (real Cmd+Option+↑/↓ keystroke → next committed frame in the shown page)');
  const s = r.switch;
  if (s.source) p(`Source: ${s.source}.`);
  p();
  table(
    ['Metric', 'Arc', 'Vela'],
    [
      ['Samples', `${s.Arc.samples.length}/${s.Arc.posts}`, `${s.Vela.samples.length}/${s.Vela.posts}`],
      [
        'Median (ms)',
        f1(median(s.Arc.samples.map((x) => x.frame))),
        f1(median(s.Vela.samples.map((x) => x.frame))),
      ],
      [
        'p95 (ms)',
        f1(
          percentile(
            s.Arc.samples.map((x) => x.frame),
            95,
          ),
        ),
        f1(
          percentile(
            s.Vela.samples.map((x) => x.frame),
            95,
          ),
        ),
      ],
      [
        'Max (ms)',
        f1(Math.max(...s.Arc.samples.map((x) => x.frame))),
        f1(Math.max(...s.Vela.samples.map((x) => x.frame))),
      ],
    ],
  );
}

console.info(lines.join('\n'));
