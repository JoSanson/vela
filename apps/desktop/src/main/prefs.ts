import { DEFAULT_PREFS, type Prefs } from '@vela/shared';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type PrefsListener = (prefs: Prefs) => void;

export class PrefsStore {
  private listeners = new Set<PrefsListener>();
  public value: Prefs;

  constructor(private readonly file: string) {
    this.value = PrefsStore.load(file);
  }

  private static load(file: string): Prefs {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Prefs>;
      return { ...DEFAULT_PREFS, ...raw, version: DEFAULT_PREFS.version };
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }

  set(patch: Partial<Prefs>): Prefs {
    this.value = { ...this.value, ...patch };
    this.persist();
    for (const l of this.listeners) l(this.value);
    return this.value;
  }

  subscribe(l: PrefsListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.value, null, 2));
      renameSync(tmp, this.file);
    } catch (err) {
      console.error('[prefs] persist failed', err);
    }
  }
}
