import { hostOf } from '@vela/core';
import type { BlockerStats } from '@vela/shared';
import { ElectronBlocker, NetworkFilter, type Request } from '@ghostery/adblocker-electron';
import { app, ipcMain, utilityProcess, webContents, type Session } from 'electron';
import { createRequire } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PrefsStore } from './prefs';

const PRELOAD_PATH = createRequire(__filename).resolve('@ghostery/adblocker-electron-preload');
const REFRESH_MS = 24 * 3600 * 1000;
const RETRY_MS = 10 * 60_000;

/**
 * Built-in content blocker (EasyList + EasyPrivacy via Ghostery's engine).
 * The engine is only ever *deserialized* in the main process (≈ 14 MB): a copy ships with the app
 * (`resources/adblock/engine.bin`, fetched at build time) and a utility process refreshes it daily.
 * Per-site toggles are exception filters keyed on the source domain.
 */
export class ContentBlocker {
  engine: ElectronBlocker | null = null;
  status: 'loading' | 'ready' | 'unavailable' = 'loading';
  source: 'custom' | 'bundled' | 'cached' | 'none' = 'none';
  private sessions = new Set<Session>();
  /** Sessions currently wired (preload script id per session). */
  private wired = new Map<Session, string>();
  private ipcRegistered = false;
  private blockedByTab = new Map<number, number>();
  private blockedTotal = 0;
  private exceptions = new Map<string, NetworkFilter[]>();
  private readonly cacheFile: string;
  private prefsSubscribed = false;

  constructor(
    private readonly prefs: PrefsStore,
    userData: string,
  ) {
    this.cacheFile = join(userData, 'adblock-engine.bin');
  }

  private bundledFile(): string {
    // Dev/e2e: out/main/ → apps/desktop/resources; packaged: Contents/Resources (extraResources).
    const base = app.isPackaged ? process.resourcesPath : join(__dirname, '..', '..', 'resources');
    return join(base, 'adblock', 'engine.bin');
  }

  async init(): Promise<void> {
    const custom = process.env.VELA_BLOCKER_FILTERS;
    try {
      if (custom) {
        this.engine = ElectronBlocker.parse(await readFile(custom, 'utf8'));
        this.source = 'custom';
      } else {
        const bundled = this.bundledFile();
        const useCache =
          existsSync(this.cacheFile) &&
          (!existsSync(bundled) || statSync(this.cacheFile).mtimeMs >= statSync(bundled).mtimeMs);
        const file = useCache ? this.cacheFile : bundled;
        this.engine = ElectronBlocker.deserialize(new Uint8Array(await readFile(file)));
        this.source = useCache ? 'cached' : 'bundled';
      }
      this.status = 'ready';
    } catch {
      this.engine = ElectronBlocker.empty();
      this.status = 'unavailable';
    }
    this.install();
    if (!custom) this.scheduleRefresh();
  }

  private install(): void {
    const engine = this.engine;
    if (!engine) return;
    engine.on('request-blocked', (req: Request) => this.record(req));
    engine.on('request-redirected', (req: Request) => this.record(req));
    this.exceptions.clear();
    for (const host of this.prefs.value.blockerDisabledHosts) this.addException(host);
    for (const ses of this.sessions) this.apply(ses);
    if (!this.prefsSubscribed) {
      this.prefsSubscribed = true;
      this.prefs.subscribe(() => {
        for (const ses of this.sessions) this.apply(ses);
      });
    }
  }

  private scheduleRefresh(): void {
    const age = existsSync(this.cacheFile) ? Date.now() - statSync(this.cacheFile).mtimeMs : Infinity;
    const delay = this.status === 'unavailable' ? RETRY_MS : Math.max(60_000, REFRESH_MS - age);
    setTimeout(() => void this.refresh(), delay).unref();
  }

  /** Fetch + parse in a utility process, then swap in the freshly serialized engine. */
  async refresh(): Promise<void> {
    if (process.env.VELA_E2E || process.env.VELA_BLOCKER_FILTERS) return;
    const script = join(__dirname, 'adblockUpdate.js');
    if (!existsSync(script)) return;
    const ok = await new Promise<boolean>((resolve) => {
      const child = utilityProcess.fork(script, [this.cacheFile], { serviceName: 'vela-adblock-update' });
      const timer = setTimeout(() => {
        child.kill();
        resolve(false);
      }, 120_000);
      child.on('message', (msg: { ok: boolean }) => {
        clearTimeout(timer);
        resolve(msg.ok);
      });
      child.on('exit', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
    if (ok) {
      try {
        const next = ElectronBlocker.deserialize(new Uint8Array(await readFile(this.cacheFile)));
        this.engine = next;
        this.source = 'cached';
        this.status = 'ready';
        this.install();
      } catch {
        /* keep the current engine */
      }
    }
    this.scheduleRefresh();
  }

  private record(req: Request): void {
    this.blockedTotal++;
    const tab = req.tabId;
    if (tab !== undefined) this.blockedByTab.set(tab, (this.blockedByTab.get(tab) ?? 0) + 1);
  }

  private initPromise: Promise<void> | null = null;

  /** Idle shells (no tab yet) do not pay for the engine: it loads with the first tab session. */
  ensureLoaded(): Promise<void> {
    this.initPromise ??= this.init();
    return this.initPromise;
  }

  attach(ses: Session): void {
    this.sessions.add(ses);
    if (!this.engine) void this.ensureLoaded();
    this.apply(ses);
  }

  /**
   * Ghostery's `enableBlockingInSession` registers its two ipcMain handlers per session and throws
   * on the second session, so the per-session wiring is done here: one global handler pair that
   * forwards to whichever engine is current, plus the preload + webRequest hooks per session.
   */
  /** Consulted for every main-frame request before the ad engine (phishing/malware lists). */
  mainFrameGuard: ((url: string, wc: Electron.WebContents | undefined) => boolean) | null = null;

  private apply(ses: Session): void {
    // The webRequest hooks are always installed (safe browsing needs them); the ad engine itself
    // only takes part when the blocker is enabled.
    const wantOn = true;
    const isOn = this.wired.has(ses);
    if (wantOn && !isOn) {
      if (!this.ipcRegistered) {
        this.ipcRegistered = true;
        ipcMain.handle('@ghostery/adblocker/inject-cosmetic-filters', (event, url: string, msg?: unknown) =>
          !this.prefs.value.blockerEnabled
            ? undefined
            : this.engine?.onInjectCosmeticFilters(
                event,
                url,
                msg as Parameters<ElectronBlocker['onInjectCosmeticFilters']>[2],
              ),
        );
        ipcMain.handle('@ghostery/adblocker/is-mutation-observer-enabled', (event) =>
          this.engine ? this.engine.onIsMutationObserverEnabled(event) : Promise.resolve(false),
        );
      }
      const id = ses.registerPreloadScript({ type: 'frame', filePath: PRELOAD_PATH });
      ses.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
        if (this.engine && this.prefs.value.blockerEnabled) this.engine.onHeadersReceived(details, callback);
        else callback({});
      });
      ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
        if (details.resourceType === 'mainFrame' && this.mainFrameGuard) {
          const wc =
            details.webContentsId !== undefined ? webContents.fromId(details.webContentsId) : undefined;
          if (this.mainFrameGuard(details.url, wc ?? undefined)) {
            callback({ cancel: true });
            return;
          }
        }
        if (!this.prefs.value.blockerEnabled) {
          callback({});
          return;
        }
        // `$redirect` filters point at data: stubs, which Chromium's webRequest refuses
        // (ERR_UNSAFE_REDIRECT in every console): blocking outright is what the page experiences anyway.
        const safe: typeof callback = (res) =>
          callback(res.redirectURL?.startsWith('data:') ? { cancel: true } : res);
        // The engine loads lazily with the first session: hold the first requests until it is in.
        if (this.engine) this.engine.onBeforeRequest(details, safe);
        else if (this.initPromise)
          void this.initPromise.then(() =>
            this.engine ? this.engine.onBeforeRequest(details, safe) : callback({}),
          );
        else callback({});
      });
      this.wired.set(ses, id);
    } else if (!wantOn && isOn) {
      const id = this.wired.get(ses);
      if (id) ses.unregisterPreloadScript(id);
      ses.webRequest.onHeadersReceived(null);
      ses.webRequest.onBeforeRequest(null);
      this.wired.delete(ses);
    }
  }

  setEnabled(enabled: boolean): void {
    this.prefs.set({ blockerEnabled: enabled });
    for (const ses of this.sessions) this.apply(ses);
  }

  resetTab(wcId: number): void {
    this.blockedByTab.delete(wcId);
  }

  private addException(host: string): void {
    if (!this.engine || this.exceptions.has(host)) return;
    // uBO-style "disable on this site": exceptions keyed on the *source* domain cover every
    // request a page on that host makes, plus its cosmetic filters.
    const filters = [`@@*$domain=${host}`, `@@*$elemhide,domain=${host}`, `@@||${host}^$document`]
      .map((f) => NetworkFilter.parse(f))
      .filter((f): f is NetworkFilter => f !== null);
    this.engine.update({ newNetworkFilters: filters });
    this.exceptions.set(host, filters);
  }

  private removeException(host: string): void {
    const filters = this.exceptions.get(host);
    if (!this.engine || !filters) return;
    this.engine.update({ removedNetworkFilters: filters.map((f) => f.getId()) });
    this.exceptions.delete(host);
  }

  setHostEnabled(host: string, enabled: boolean): void {
    const h = host.toLowerCase().replace(/^www\./, '');
    const list = new Set(this.prefs.value.blockerDisabledHosts);
    if (enabled) {
      list.delete(h);
      this.removeException(h);
    } else {
      list.add(h);
      this.addException(h);
    }
    this.prefs.set({ blockerDisabledHosts: [...list] });
  }

  isHostEnabled(host: string): boolean {
    return !this.prefs.value.blockerDisabledHosts.includes(host.toLowerCase().replace(/^www\./, ''));
  }

  stats(url: string, wcId: number | undefined): BlockerStats {
    const host = hostOf(url);
    return {
      enabled: this.prefs.value.blockerEnabled && this.status === 'ready',
      enabledForHost: this.isHostEnabled(host),
      host,
      blockedOnTab: wcId === undefined ? 0 : (this.blockedByTab.get(wcId) ?? 0),
      blockedTotal: this.blockedTotal,
    };
  }
}
