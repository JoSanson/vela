import { execFile, execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const JXA = join(dirname(fileURLToPath(import.meta.url)), 'jxa');

export const jxa = async (script, args, timeout = 60_000) =>
  (
    await run('osascript', ['-l', 'JavaScript', join(JXA, script), ...args.map(String)], { timeout })
  ).stdout.trim();

export const activate = (pid) => jxa('activate.js', [pid]);

export async function assertUnlocked(what) {
  if ((await jxa('locked.js', [])) === '1')
    throw new Error(`screen locked during ${what}: results would be invalid`);
}

/** Root pid plus every descendant (Chromium helpers are children of the browser process). */
export function processTree(root) {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,comm='], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((l) => {
      const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l);
      return m ? { pid: +m[1], ppid: +m[2], comm: m[3] } : null;
    })
    .filter(Boolean);
  const out = [];
  const queue = [root];
  while (queue.length) {
    const pid = queue.shift();
    const row = rows.find((r) => r.pid === pid);
    if (row) out.push(row);
    for (const r of rows) if (r.ppid === pid) queue.push(r.pid);
  }
  return out;
}

/** Chromium process role from the helper's command line (`--type=renderer`, GPU, utility…). */
function roleOf(pid) {
  try {
    const cmd = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
    const type = /--type=([\w-]+)/.exec(cmd)?.[1];
    if (!type) return 'browser';
    if (type === 'gpu-process') return 'gpu';
    if (type === 'utility') return /utility-sub-type=([\w.]+)/.exec(cmd)?.[1]?.split('.')[0] ?? 'utility';
    return type;
  } catch {
    return 'gone';
  }
}

async function footprintMB(pid) {
  try {
    const { stdout } = await run('/usr/bin/footprint', ['-f', 'bytes', '-p', String(pid)]);
    const m = /phys_footprint:\s+(\d+) B/.exec(stdout);
    return m ? Number(m[1]) / 1024 ** 2 : 0;
  } catch {
    return 0;
  }
}

/**
 * phys_footprint (what Activity Monitor's "Memory" column shows) summed over the whole tree, plus
 * a per-role breakdown. RSS would count the shared Chromium framework once per process.
 */
export async function memoryOf(root) {
  const tree = processTree(root);
  const rows = await Promise.all(
    tree.map(async (p) => ({ ...p, role: roleOf(p.pid), mb: await footprintMB(p.pid) })),
  );
  const byRole = {};
  for (const r of rows) byRole[r.role] = (byRole[r.role] ?? 0) + r.mb;
  return { totalMB: rows.reduce((s, r) => s + r.mb, 0), processes: rows.length, byRole, rows };
}

const cpuSeconds = (t) => {
  const parts = t.split(':').map(Number);
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
};

/** Cumulative CPU seconds (user + sys) of the tree; dead helpers are lost, so sample over short windows. */
export function cpuOf(root) {
  const pids = processTree(root).map((p) => p.pid);
  if (!pids.length) return 0;
  const out = execFileSync('ps', ['-o', 'time=', '-p', pids.join(',')], { encoding: 'utf8' });
  return out
    .trim()
    .split('\n')
    .reduce((s, l) => s + cpuSeconds(l.trim()), 0);
}

export async function cpuOver(root, ms) {
  const a = cpuOf(root);
  const t = Date.now();
  await sleep(ms);
  const b = cpuOf(root);
  return {
    cpuSec: b - a,
    wallSec: (Date.now() - t) / 1000,
    pct: ((b - a) / ((Date.now() - t) / 1000)) * 100,
  };
}

export const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export async function waitExit(pid, timeout = 20_000) {
  const end = Date.now() + timeout;
  while (isAlive(pid) && Date.now() < end) await sleep(100);
  return !isAlive(pid);
}

export const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const percentile = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
