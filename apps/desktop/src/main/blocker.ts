import { hostOf } from '@vela/core';
import type { BlockerStats } from '@vela/shared';
import { ElectronBlocker, NetworkFilter, type Request } from '@ghostery/adblocker-electron';
import type { Session } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PrefsStore } from './prefs';

const RETRY_MS = 10 * 60_000;

/**
 * Built-in content blocker (EasyList + EasyPrivacy via Ghostery's prebuilt engine, cached on disk).
 * Per-site toggles are implemented as `$document`/`$elemhide` exception filters added to the engine.
 */
export class ContentBlocker {
  engine: ElectronBlocker | null = null;
  status: 'loading' | 'ready' | 'unavailable' = 'loading';
  private sessions = new Set<Session>();
  private blockedByTab = new Map<number, number>();
  private blockedTotal = 0;
  private exceptions = new Map<string, NetworkFilter[]>();

  constructor(
    private readonly prefs: PrefsStore,
    private readonly userData: string,
  ) {}

  async init(): Promise<void> {
    const custom = process.env.VELA_BLOCKER_FILTERS;
    try {
      if (custom) {
        this.engine = ElectronBlocker.parse(await readFile(custom, 'utf8'));
      } else {
        this.engine = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
          path: join(this.userData, 'adblock-engine.bin'),
          read: async (p) => new Uint8Array(await readFile(p)),
          write: (p, buf) => writeFile(p, buf),
        });
      }
      this.status = 'ready';
    } catch {
      this.engine = ElectronBlocker.empty();
      this.status = 'unavailable';
      setTimeout(() => void this.init(), RETRY_MS);
    }
    const engine = this.engine;
    engine.on('request-blocked', (req: Request) => this.record(req));
    engine.on('request-redirected', (req: Request) => this.record(req));
    for (const host of this.prefs.value.blockerDisabledHosts) this.addException(host);
    for (const ses of this.sessions) this.apply(ses);
    this.prefs.subscribe(() => {
      for (const ses of this.sessions) this.apply(ses);
    });
  }

  private record(req: Request): void {
    this.blockedTotal++;
    const tab = req.tabId;
    if (tab !== undefined) this.blockedByTab.set(tab, (this.blockedByTab.get(tab) ?? 0) + 1);
  }

  attach(ses: Session): void {
    this.sessions.add(ses);
    if (this.engine) this.apply(ses);
  }

  private apply(ses: Session): void {
    if (!this.engine) return;
    if (this.prefs.value.blockerEnabled) this.engine.enableBlockingInSession(ses);
    else this.engine.disableBlockingInSession(ses);
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
