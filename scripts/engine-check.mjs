#!/usr/bin/env node
/* global process, console, fetch */
// Compare the Electron version pinned in apps/desktop/package.json with the latest stable on npm.
// Used by engine-watch.yml. Writes key=value pairs to $GITHUB_OUTPUT when set, else to stdout.
//
//   node scripts/engine-check.mjs [--force <version>]
//
// Outputs: current, latest, chromium, node, update (true|false), major (true|false)
import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'apps/desktop/package.json'), 'utf8'));
const current = String(pkg.devDependencies.electron).replace(/^[\^~=]/, '');

const args = process.argv.slice(2);
const forceIdx = args.indexOf('--force');
const forced = forceIdx !== -1 ? args[forceIdx + 1] : undefined;
if (forceIdx !== -1 && !/^\d+\.\d+\.\d+$/.test(forced ?? '')) {
  console.error('--force expects an exact x.y.z version');
  process.exit(2);
}

const latest = forced ?? execFileSync('npm', ['view', 'electron', 'version'], { encoding: 'utf8' }).trim();
const update = forced ? forced !== current : compare(latest, current) > 0;

const { chromium, node } = await releaseInfo(latest);

const major = update && latest.split('.')[0] !== current.split('.')[0];
const out = { current, latest, chromium, node, update: String(update), major: String(major) };
const lines = Object.entries(out).map(([k, v]) => `${k}=${v}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
console.info(lines.join('\n'));

function compare(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

async function releaseInfo(version) {
  try {
    const res = await fetch('https://releases.electronjs.org/releases.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const releases = await res.json();
    const hit = releases.find((r) => r.version === version);
    return { chromium: hit?.chrome ?? 'unknown', node: hit?.node ?? 'unknown' };
  } catch (err) {
    console.error(`warning: could not fetch releases.json (${err.message})`);
    return { chromium: 'unknown', node: 'unknown' };
  }
}
