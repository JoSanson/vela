#!/usr/bin/env node
/* global process, console */
// Bump the app version in root package.json + apps/desktop/package.json and promote the
// CHANGELOG.md "Unreleased" section to a dated version header.
//
//   node scripts/bump-version.mjs <patch|minor|major|x.y.z> [--dry-run]
//
// Prints the new version on stdout (used by engine-release.yml).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageFiles = ['package.json', 'apps/desktop/package.json'].map((p) => join(root, p));
const changelogFile = join(root, 'CHANGELOG.md');

const [spec, ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');

if (!spec) {
  console.error('usage: bump-version.mjs <patch|minor|major|x.y.z> [--dry-run]');
  process.exit(2);
}

const desktopPkg = JSON.parse(readFileSync(packageFiles[1], 'utf8'));
const current = desktopPkg.version;
const next = resolveNext(current, spec);

for (const file of packageFiles) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  pkg.version = next;
  if (!dryRun) writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

if (existsSync(changelogFile)) {
  const md = readFileSync(changelogFile, 'utf8');
  const updated = promoteUnreleased(md, next);
  if (updated === md) {
    console.error(`warning: no "Unreleased" section found in CHANGELOG.md, left untouched`);
  } else if (!dryRun) {
    writeFileSync(changelogFile, updated);
  }
} else {
  console.error('warning: CHANGELOG.md not found, skipping changelog update');
}

process.stdout.write(`${next}\n`);

function resolveNext(from, s) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(from);
  if (!m) throw new Error(`current version "${from}" is not x.y.z`);
  let [major, minor, patch] = m.slice(1).map(Number);
  switch (s) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      if (!/^\d+\.\d+\.\d+$/.test(s)) throw new Error(`invalid version spec "${s}"`);
      return s;
  }
}

function promoteUnreleased(md, version) {
  const date = new Date().toISOString().slice(0, 10);
  // Accepts "## [Unreleased]" or "## Unreleased" (keep-a-changelog style). The empty Unreleased
  // header is re-inserted above the new version so the next cycle has somewhere to write.
  return md.replace(/^## \[?Unreleased\]?[^\n]*\n/m, `## [Unreleased]\n\n## [${version}] - ${date}\n`);
}
