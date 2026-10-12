// results.json → docs/benchmark/arc-vs-vela.svg (2×2 small multiples, light + dark via media query).
// `node perf/compare/charts.mjs`. Values are read, never typed, so the chart cannot drift from the data.
import console from 'node:console';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { median } from './system.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const r = JSON.parse(readFileSync(join(HERE, 'results.json'), 'utf8'));
const OUT = join(HERE, '../../../../docs/benchmark/arc-vs-vela.svg');

const startup = (k) => median(r.startup[k].map((x) => x.windowMs));
const sw = (k) => median(r.switch[k].samples.map((x) => x.frame));
const M = r.memory;

const panels = [
  {
    title: 'Launch → window on screen',
    unit: 'ms',
    rows: [
      { who: 'Arc', v: startup('Arc') },
      { who: 'Vela', v: startup('Vela') },
    ],
  },
  {
    title: 'Memory, 1 tab + 10 real sites',
    unit: 'MB',
    rows: [
      { who: 'Arc', v: M.Arc.elevenTabs.totalMB },
      { who: 'Vela', v: M['Vela (blocker off)'].elevenTabs.totalMB },
      { who: 'Vela + blocker', v: M.Vela.elevenTabs.totalMB, hatch: true },
    ],
  },
  {
    title: 'Idle CPU, same 11 tabs',
    unit: '% of a core',
    rows: [
      { who: 'Arc', v: M.Arc.cpuFg.pct },
      { who: 'Vela', v: M['Vela (blocker off)'].cpuFg.pct },
      { who: 'Vela + blocker', v: M.Vela.cpuFg.pct, hatch: true },
    ],
  },
  {
    title: 'Tab switch, keystroke → frame',
    unit: 'ms, median',
    rows: [
      { who: 'Arc', v: sw('Arc') },
      { who: 'Vela', v: sw('Vela') },
    ],
  },
];

const W = 880;
const PW = 420;
const PH = 168;
const GAP_X = 40;
const LABEL = 112;
const BAR_H = 20;
const ROW = 32;
const fmt = (v, unit) => {
  if (unit.startsWith('%')) return `${v.toFixed(1)} %`;
  return `${v < 20 ? v.toFixed(1) : Math.round(v).toLocaleString('en-US')} ${unit.split(',')[0]}`;
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function panel(p, x0, y0) {
  const max = Math.max(...p.rows.map((row) => row.v));
  const span = PW - LABEL - 96;
  const arc = p.rows[0].v;
  const vela = p.rows[1].v;
  const callout = p.unit.startsWith('ms')
    ? `${(arc / vela).toFixed(1)}× faster`
    : `${Math.round((1 - vela / arc) * 100)} % less`;
  const out = [
    `<text class="t" x="${x0}" y="${y0 + 16}">${esc(p.title)}</text>`,
    `<text class="m" x="${x0}" y="${y0 + 34}">${esc(p.unit)} · lower is better</text>`,
    `<text class="c" x="${x0 + PW}" y="${y0 + 16}" text-anchor="end">Vela: ${callout}</text>`,
  ];
  p.rows.forEach((row, i) => {
    const y = y0 + 52 + i * ROW;
    const w = Math.max(4, (row.v / max) * span);
    const cls = row.who === 'Arc' ? 'arc' : 'vela';
    out.push(`<text class="l" x="${x0 + LABEL - 10}" y="${y + 15}" text-anchor="end">${esc(row.who)}</text>`);
    // Bars anchor on the baseline: square left edge, 4px rounded data end (path, not rx on both sides).
    const d = `M${x0 + LABEL},${y}h${w - 4}a4,4 0 0 1 4,4v${BAR_H - 8}a4,4 0 0 1 -4,4h${-(w - 4)}z`;
    out.push(`<path class="${cls}${row.hatch ? ' hatch' : ''}" d="${d}"/>`);
    out.push(`<text class="v" x="${x0 + LABEL + w + 8}" y="${y + 15}">${fmt(row.v, p.unit)}</text>`);
  });
  out.push(
    `<line class="axis" x1="${x0 + LABEL}" x2="${x0 + LABEL}" y1="${y0 + 46}" y2="${y0 + 52 + p.rows.length * ROW - 6}"/>`,
  );
  return out.join('\n  ');
}

const rows = Math.ceil(panels.length / 2);
const H = rows * PH + 44;
const body = panels.map((p, i) => panel(p, (i % 2) * (PW + GAP_X), Math.floor(i / 2) * PH + 4)).join('\n  ');
const m = r.machine;
const foot = `Measured on ${m.cpu}, ${m.ramGB} GB · Arc ${r.versions?.Arc?.version ?? ''} vs Vela ${r.versions?.Vela?.version ?? ''} · same machine, same probes · method: apps/desktop/perf/compare`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Benchmark, lower is better. ${panels
  .map((p) => `${p.title}: ${p.rows.map((row) => `${row.who} ${fmt(row.v, p.unit)}`).join(', ')}`)
  .join('. ')}.">
  <title>Arc vs Vela benchmark</title>
  <style>
    text { font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; fill: #1f2328; }
    .t { font-size: 15px; font-weight: 600; }
    .m, .f { fill: #59636e; font-size: 12px; }
    .c { font-weight: 600; fill: #1f2328; }
    .l { fill: #59636e; }
    .v { font-variant-numeric: tabular-nums; }
    .arc { fill: #eb6834; }
    .vela { fill: #2a78d6; }
    .hatch { fill-opacity: 0.4; stroke: #2a78d6; stroke-width: 1.5; }
    .axis { stroke: #d1d9e0; stroke-width: 1; }
    @media (prefers-color-scheme: dark) {
      text, .c { fill: #f0f6fc; }
      .m, .f, .l { fill: #9198a1; }
      .arc { fill: #d95926; }
      .vela { fill: #3987e5; }
      .hatch { stroke: #3987e5; }
      .axis { stroke: #3d444d; }
    }
  </style>
  ${body}
  <text class="f" x="0" y="${H - 8}">${esc(foot)}</text>
</svg>
`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg);
console.info(`wrote ${OUT}`);
