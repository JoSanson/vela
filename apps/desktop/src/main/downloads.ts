import type { DownloadItemState } from '@vela/shared';
import { app, shell, type DownloadItem, type Session } from 'electron';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { DownloadsRepo } from './db/repos';
import type { PrefsStore } from './prefs';

const DANGEROUS_EXT = new Set([
  '.exe',
  '.msi',
  '.msix',
  '.dmg',
  '.pkg',
  '.app',
  '.sh',
  '.command',
  '.bat',
  '.cmd',
  '.ps1',
  '.scr',
  '.jar',
  '.apk',
  '.deb',
  '.rpm',
  '.appimage',
  '.vbs',
  '.js',
  '.hta',
  '.reg',
]);

export class DownloadManager {
  private items = new Map<string, DownloadItem>();
  private states = new Map<string, DownloadItemState>();
  private listeners = new Set<(list: DownloadItemState[]) => void>();
  private timer: NodeJS.Timeout | null = null;

  prefs: PrefsStore | null = null;

  constructor(private readonly repo: DownloadsRepo) {
    for (const d of repo.list()) {
      // Anything still "progressing" from a previous run was interrupted by the quit.
      this.states.set(
        d.id,
        d.state === 'progressing' ? { ...d, state: 'interrupted', endedAt: Date.now() } : d,
      );
    }
  }

  onChange(fn: (list: DownloadItemState[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Set by main: the tab whose navigation turned into a download (closes blank orphans). */
  onStarted: ((wc: Electron.WebContents, filename: string) => void) | null = null;

  attach(ses: Session): void {
    ses.on('will-download', (_event, item, wc) => {
      this.onStarted?.(wc, item.getFilename());
      this.track(item);
    });
  }

  list(): DownloadItemState[] {
    return [...this.states.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  /** Chrome-like: save straight into ~/Downloads with a unique name instead of prompting. */
  /** Set by main: how to start a fresh download of a URL (retry) and how to warn about a held file. */
  retry: ((url: string) => void) | null = null;
  onDangerous: ((id: string, filename: string) => void) | null = null;
  private readonly keepers = new Map<string, () => void>();

  private static uniquePath(filename: string, preferredDir: string | null): string {
    let fallback: string;
    try {
      fallback = app.getPath('downloads');
    } catch {
      fallback = join(app.getPath('home'), 'Downloads');
    }
    const dir =
      process.env.VELA_DOWNLOAD_DIR ?? (preferredDir && existsSync(preferredDir) ? preferredDir : fallback);
    const ext = extname(filename);
    const base = filename.slice(0, filename.length - ext.length) || 'download';
    let candidate = join(dir, filename);
    for (let i = 1; existsSync(candidate); i++) candidate = join(dir, `${base} (${i})${ext}`);
    return candidate;
  }

  private track(item: DownloadItem): void {
    const id = crypto.randomUUID();
    const prefs = this.prefs?.value;
    // Executables and installers land in a side file that cannot be opened until the user says
    // "Keep" (then it is renamed into place) — the quarantine Chrome applies, without a pause.
    const dangerous = DANGEROUS_EXT.has(extname(item.getFilename() || '').toLowerCase());
    let held = dangerous;
    const finalPath = DownloadManager.uniquePath(
      item.getFilename() || 'download',
      prefs?.downloadDir ?? null,
    );
    if (prefs?.askWhereToSave && !process.env.VELA_DOWNLOAD_DIR && !dangerous) {
      item.setSaveDialogOptions({ defaultPath: finalPath });
    } else {
      item.setSavePath(dangerous ? `${finalPath}.vela-held` : finalPath);
    }
    this.items.set(id, item);
    let lastSaved = 0;
    let finished: DownloadItemState['state'] | null = null;
    const update = (state: DownloadItemState['state'], ended = false): void => {
      const s: DownloadItemState = {
        id,
        url: item.getURL(),
        filename: item.getFilename() || basename(finalPath),
        path: held ? finalPath : item.getSavePath().replace(/\.vela-held$/, ''),
        state,
        paused: item.isPaused(),
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        startedAt: this.states.get(id)?.startedAt ?? Date.now(),
        endedAt: ended ? Date.now() : null,
        ...(held ? { dangerous: true } : {}),
      };
      this.states.set(id, s);
      if (ended || state !== 'progressing' || Date.now() - lastSaved > 1000) {
        lastSaved = Date.now();
        this.repo.save(s);
      }
      this.notify();
    };
    const release = (): void => {
      // Move the held file into place; only then does it count as completed.
      try {
        renameSync(`${finalPath}.vela-held`, finalPath);
      } catch {
        /* already moved or gone */
      }
      update('completed', true);
    };
    update('progressing');
    if (held) {
      this.onDangerous?.(id, item.getFilename());
      this.keepers.set(id, () => {
        held = false;
        if (finished === 'completed') release();
        else update('progressing');
      });
    }
    item.on('updated', (_e, state) => update(state === 'interrupted' ? 'interrupted' : 'progressing'));
    item.once('done', (_e, state) => {
      finished = state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted';
      if (finished === 'completed' && held) update('progressing');
      else if (finished === 'completed') release();
      else {
        rmSync(`${finalPath}.vela-held`, { force: true });
        update(finished, true);
      }
      this.items.delete(id);
      if (state === 'completed' && process.platform === 'darwin') {
        // Bounce the dock icon like Chrome does.
        void import('electron').then(({ app }) => app.dock?.downloadFinished(item.getSavePath()));
      }
    });
  }

  action(
    id: string,
    action: 'pause' | 'resume' | 'cancel' | 'open' | 'showInFolder' | 'remove' | 'retry' | 'keep',
  ): void {
    const item = this.items.get(id);
    const state = this.states.get(id);
    switch (action) {
      case 'keep':
        this.keepers.get(id)?.();
        this.keepers.delete(id);
        break;
      case 'retry':
        if (state && state.state !== 'progressing') {
          this.retry?.(state.url);
          this.states.delete(id);
          this.repo.remove(id);
          this.notify();
        }
        break;
      case 'pause':
        item?.pause();
        break;
      case 'resume':
        if (item?.canResume()) item.resume();
        break;
      case 'cancel':
        item?.cancel();
        if (state?.dangerous) {
          rmSync(`${state.path}.vela-held`, { force: true });
          this.keepers.delete(id);
          const cancelled: DownloadItemState = { ...state, state: 'cancelled', endedAt: Date.now() };
          this.states.set(id, cancelled);
          this.repo.save(cancelled);
          this.notify();
        }
        break;
      case 'open':
        if (state?.path) void shell.openPath(state.path);
        break;
      case 'showInFolder':
        if (state?.path) shell.showItemInFolder(state.path);
        break;
      case 'remove':
        item?.cancel();
        this.states.delete(id);
        this.repo.remove(id);
        this.notify();
        break;
    }
    if (item && action !== 'remove') {
      const s = this.states.get(id);
      if (s) {
        this.states.set(id, { ...s, paused: item.isPaused() });
        this.notify();
      }
    }
  }

  clearFinished(): void {
    for (const s of [...this.states.values()]) {
      if (s.state !== 'progressing') {
        this.states.delete(s.id);
        this.repo.remove(s.id);
      }
    }
    this.notify();
  }

  private notify(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const list = this.list();
      for (const l of this.listeners) l(list);
    }, 120);
  }
}
