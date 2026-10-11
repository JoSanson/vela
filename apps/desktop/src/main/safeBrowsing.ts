import { app, net } from 'electron';
import { existsSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PrefsStore } from './prefs';

const REFRESH_MS = 24 * 3600 * 1000;
const FEEDS = {
  hosts: 'https://urlhaus.abuse.ch/downloads/hostfile/',
  urls: 'https://openphish.com/feed.txt',
};

interface List {
  fetchedAt: string | null;
  hosts: string[];
  urls: string[];
}

export type Threat = 'malware' | 'phishing';

/**
 * Phishing / malware protection from public feeds (URLhaus hosts, OpenPhish URLs). A list ships
 * with the app and is refreshed daily into userData; lookups are local, nothing about the user's
 * navigation leaves the machine. Main-frame requests to a listed host or URL are blocked before
 * they start and replaced by the interstitial; the user can proceed per host for the session.
 */
export class SafeBrowsing {
  private hosts = new Set<string>();
  private urls: string[] = [];
  private readonly allowed = new Set<string>();
  private readonly cacheFile: string;
  loaded = false;

  constructor(
    private readonly prefs: PrefsStore,
    userData: string,
  ) {
    this.cacheFile = join(userData, 'safebrowsing.json');
  }

  private bundledFile(): string {
    const base = app.isPackaged ? process.resourcesPath : join(__dirname, '..', '..', 'resources');
    return join(base, 'safebrowsing', 'list.json');
  }

  async init(): Promise<void> {
    const bundled = this.bundledFile();
    const useCache =
      existsSync(this.cacheFile) &&
      (!existsSync(bundled) || statSync(this.cacheFile).mtimeMs >= statSync(bundled).mtimeMs);
    const file = useCache ? this.cacheFile : bundled;
    try {
      this.apply(JSON.parse(await readFile(file, 'utf8')) as List);
    } catch {
      /* no list: protection is simply off until the first refresh */
    }
    this.loaded = true;
    if (!process.env.VELA_E2E) {
      const age = existsSync(this.cacheFile) ? Date.now() - statSync(this.cacheFile).mtimeMs : Infinity;
      setTimeout(() => void this.refresh(), Math.max(30_000, REFRESH_MS - age)).unref();
    }
  }

  private apply(list: List): void {
    this.hosts = new Set(list.hosts.map((h) => h.toLowerCase()));
    this.urls = list.urls.map((u) => u.toLowerCase());
  }

  async refresh(): Promise<void> {
    try {
      const [hostfile, phish] = await Promise.all([
        net.fetch(FEEDS.hosts, { signal: AbortSignal.timeout(30_000) }).then((r) => r.text()),
        net.fetch(FEEDS.urls, { signal: AbortSignal.timeout(30_000) }).then((r) => r.text()),
      ]);
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
      if (hosts.length < 100) throw new Error('feed looks empty');
      const list: List = { fetchedAt: new Date().toISOString(), hosts, urls };
      await writeFile(this.cacheFile, JSON.stringify(list));
      this.apply(list);
    } catch (err) {
      console.warn('[safebrowsing] refresh failed', err);
    } finally {
      setTimeout(() => void this.refresh(), REFRESH_MS).unref();
    }
  }

  /** Why `url` must not load, or null. */
  check(url: string): Threat | null {
    if (!this.prefs.value.safeBrowsing) return null;
    let host: string;
    let normalized: string;
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      host = u.hostname.toLowerCase();
      normalized = `${u.protocol}//${u.host}${u.pathname}${u.search}`.toLowerCase();
    } catch {
      return null;
    }
    if (this.allowed.has(host)) return null;
    if (this.hosts.has(host) || this.hosts.has(host.replace(/^www\./, ''))) return 'malware';
    for (const bad of this.urls)
      if (normalized.startsWith(bad) || bad.startsWith(`${normalized}/`)) return 'phishing';
    return null;
  }

  /** The user chose to proceed: no more warnings for this host until restart. */
  allow(host: string): void {
    this.allowed.add(host.toLowerCase());
  }

  /** Test hook: mark a URL or host as dangerous for this session. */
  addTestEntry(entry: string): void {
    if (/^https?:\/\//i.test(entry)) this.urls.push(entry.toLowerCase());
    else this.hosts.add(entry.toLowerCase());
  }
}
