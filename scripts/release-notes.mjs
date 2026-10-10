#!/usr/bin/env node
/* global process, console */
// Print the CHANGELOG.md section for a version (without its header). Empty output when the
// changelog or the section is missing, so callers can fall back to generated notes.
//
//   node scripts/release-notes.mjs <x.y.z|vx.y.z>
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const changelog = join(root, 'CHANGELOG.md');
const version = (process.argv[2] ?? '').replace(/^v/, '');

if (!version) {
  console.error('usage: release-notes.mjs <version>');
  process.exit(2);
}
if (!existsSync(changelog)) process.exit(0);

const md = readFileSync(changelog, 'utf8');
const escaped = version.replace(/\./g, '\\.');
const re = new RegExp(`^## \\[?${escaped}\\]?[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm');
const m = re.exec(md);
if (m) process.stdout.write(`${m[1].trim()}\n`);
