import { DEFAULT_PREFS, type Prefs } from '@vela/shared';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

export type PrefsListener = (prefs: Prefs) => void;

const WRITE_DELAY_MS = 120;

/** Keeps only keys that exist in the defaults with the same shape; a damaged file loses one key, not all. */
function sanitize(raw: unknown): Partial<Prefs> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, unknown> = {};
  const input = raw as Record<string, unknown>;
  for (const [key, def] of Object.entries(DEFAULT_PREFS)) {
    const v = input[key];
    if (v === undefined) continue;
    if (def === null) {
      if (v === null || typeof v === 'object' || typeof v === 'string') out[key] = v;
    } else if (Array.isArray(def)) {
      if (Array.isArray(v)) out[key] = v;
    } else if (typeof v === typeof def) out[key] = v;
  }
  return out;
}

export class PrefsStore {
  private listeners = new Set<PrefsListener>();
  private timer: NodeJS.Timeout | null = null;
  public value: Prefs;

  constructor(private readonly file: string) {
    this.value = PrefsStore.load(file);
  }

  private static load(file: string): Prefs {
    for (const candidate of [file, `${file}.bak`]) {
      try {
        const raw: unknown = JSON.parse(readFileSync(candidate, 'utf8'));
        return { ...DEFAULT_PREFS, ...sanitize(raw), version: DEFAULT_PREFS.version };
      } catch {
        /* missing or damaged: try the backup, then defaults */
      }
    }
    return { ...DEFAULT_PREFS };
  }

  set(patch: Partial<Prefs>): Prefs {
    this.value = { ...this.value, ...patch };
    this.schedule();
    for (const l of this.listeners) {
      try {
        l(this.value);
      } catch (err) {
        console.error('[prefs] listener failed', err);
      }
    }
    return this.value;
  }

  subscribe(l: PrefsListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Window moves and zoom steps fire in bursts: coalesce them into one durable write. */
  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, WRITE_DELAY_MS);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      const fd = openSync(tmp, 'w');
      try {
        writeSync(fd, JSON.stringify(this.value, null, 2));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      try {
        renameSync(this.file, `${this.file}.bak`);
      } catch {
        /* first write */
      }
      renameSync(tmp, this.file);
    } catch (err) {
      console.error('[prefs] persist failed', err);
    }
  }
}
