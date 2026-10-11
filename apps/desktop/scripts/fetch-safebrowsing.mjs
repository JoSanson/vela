// Downloads the free phishing/malware feeds Vela ships with (refreshed daily by the app itself):
//   - URLhaus (abuse.ch) malware hosts
//   - OpenPhish community phishing URLs
// Stored as resources/safebrowsing/list.json; keeps the previous file when offline.
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'safebrowsing');
const file = join(dir, 'list.json');
const MAX_AGE_MS = 24 * 3600 * 1000;

if (
  existsSync(file) &&
  Date.now() - statSync(file).mtimeMs < MAX_AGE_MS &&
  !process.argv.includes('--force')
) {
  process.stdout.write('[safebrowsing] list.json is fresh, skipping\n');
  process.exit(0);
}

const FEEDS = {
  hosts: 'https://urlhaus.abuse.ch/downloads/hostfile/',
  urls: 'https://openphish.com/feed.txt',
};

async function text(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

try {
  const [hostfile, phish] = await Promise.all([text(FEEDS.hosts), text(FEEDS.urls)]);
  const hosts = hostfile
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)[1] ?? '')
    .filter((h) => h && h !== 'localhost');
  const urls = phish
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\//i.test(l));
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify({ fetchedAt: new Date().toISOString(), hosts, urls }));
  process.stdout.write(`[safebrowsing] wrote ${hosts.length} hosts + ${urls.length} urls\n`);
} catch (err) {
  process.stdout.write(
    `[safebrowsing] fetch failed (${err instanceof Error ? err.message : String(err)}); ${existsSync(file) ? 'keeping previous list' : 'no list available'}\n`,
  );
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify({ fetchedAt: null, hosts: [], urls: [] }));
  }
}
