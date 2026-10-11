import type { CoreAction } from '@vela/core';
import type {
  IpcEventChannel,
  IpcEventMap,
  IpcInvokeChannel,
  IpcInvokeMap,
  Prefs,
  ShellSnapshot,
} from '@vela/shared';
import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import { invoke, vela } from '../lib/api';
import { t } from '../lib/i18n';

/** Invokes a channel and swallows failures (handler not registered yet, bridge missing). */
export async function tryInvoke<K extends IpcInvokeChannel>(
  ch: K,
  req: IpcInvokeMap[K]['req'],
): Promise<IpcInvokeMap[K]['res'] | null> {
  try {
    return await invoke(ch, req);
  } catch (err) {
    console.warn(`[vela pages] ${ch} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export function useEvent<K extends IpcEventChannel>(ch: K, cb: (payload: IpcEventMap[K]) => void): void {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => vela.on(ch, (payload) => ref.current(payload)), [ch]);
}

export interface SnapshotContextValue {
  snap: ShellSnapshot | null;
  /** True when `snapshot/get` itself failed — the bridge is unavailable. */
  failed: boolean;
  refresh: () => Promise<void>;
  /** Dispatches a core action and re-reads the snapshot. Resolves false on failure. */
  dispatch: (action: CoreAction) => Promise<boolean>;
  setPrefs: (patch: Partial<Prefs>) => Promise<boolean>;
}

export const SnapshotContext = createContext<SnapshotContextValue>({
  snap: null,
  failed: false,
  refresh: () => Promise.resolve(),
  dispatch: () => Promise.resolve(false),
  setPrefs: () => Promise.resolve(false),
});

export function useSnapshot(): SnapshotContextValue {
  return useContext(SnapshotContext);
}

const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function useSystemDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      darkQuery?.addEventListener('change', cb);
      return () => darkQuery?.removeEventListener('change', cb);
    },
    () => darkQuery?.matches ?? false,
  );
}

export function useHash(): string {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
    () => location.hash.replace(/^#/, ''),
  );
}

export function openUrl(input: string): void {
  void tryInvoke('tab/openUrl', { input, activate: true, noAtc: input.startsWith('vela://') });
}

/** Wall clock for event handlers (kept out of render so the purity lint stays honest). */
export function now(): number {
  return Date.now();
}

let nowValue = Date.now();
const nowListeners = new Set<() => void>();
let nowTimer: ReturnType<typeof setInterval> | null = null;

/** Current time, refreshed every 30 s so relative timestamps ("3 h ago") stay accurate. */
export function useNow(): number {
  return useSyncExternalStore(
    (cb) => {
      nowValue = Date.now();
      nowListeners.add(cb);
      nowTimer ??= setInterval(() => {
        nowValue = Date.now();
        for (const l of nowListeners) l();
      }, 30_000);
      return () => {
        nowListeners.delete(cb);
        if (nowListeners.size === 0 && nowTimer) {
          clearInterval(nowTimer);
          nowTimer = null;
        }
      };
    },
    () => nowValue,
  );
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function timeAgo(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts);
  if (diff < MINUTE) return t('pages.time.justNow');
  if (diff < HOUR) return t('pages.time.minutesAgo', { n: Math.floor(diff / MINUTE) });
  if (diff < DAY) return t('pages.time.hoursAgo', { n: Math.floor(diff / HOUR) });
  if (diff < 7 * DAY) return t('pages.time.daysAgo', { n: Math.floor(diff / DAY) });
  return new Date(ts).toLocaleDateString(t.locale, { month: 'short', day: 'numeric' });
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' });
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayKey(ts: number): number {
  return startOfDay(ts);
}

export function dayLabel(dayStart: number, now: number = Date.now()): string {
  const today = startOfDay(now);
  if (dayStart === today) return t('pages.time.today');
  if (dayStart === today - DAY) return t('pages.time.yesterday');
  const d = new Date(dayStart);
  const opts: Intl.DateTimeFormatOptions =
    today - dayStart < 7 * DAY
      ? { weekday: 'long' }
      : { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString(t.locale, opts);
}

const SIZE_UNITS = ['pages.size.kb', 'pages.size.mb', 'pages.size.gb', 'pages.size.tb'] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '–';
  if (bytes < 1024)
    return t('pages.size.b', { n: new Intl.NumberFormat(t.locale, { useGrouping: false }).format(bytes) });
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < SIZE_UNITS.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = v < 10 ? 1 : 0;
  const n = new Intl.NumberFormat(t.locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(v);
  return t(SIZE_UNITS[i] ?? 'pages.size.tb', { n });
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return t('pages.duration.seconds', { s });
  const m = Math.floor(s / 60);
  if (m < 60) return t('pages.duration.minutes', { m, s: s % 60 });
  return t('pages.duration.hours', { h: Math.floor(m / 60), m: m % 60 });
}

/** Triggers a browser download of a text blob. */
export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
