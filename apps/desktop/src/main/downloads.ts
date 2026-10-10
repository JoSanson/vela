import type { DownloadItemState } from '@vela/shared';
import { app, shell, type DownloadItem, type Session } from 'electron';
import { existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { DownloadsRepo } from './db/repos';

export class DownloadManager {
  private items = new Map<string, DownloadItem>();
  private states = new Map<string, DownloadItemState>();
  private listeners = new Set<(list: DownloadItemState[]) => void>();
  private timer: NodeJS.Timeout | null = null;

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

  attach(ses: Session): void {
    ses.on('will-download', (_event, item) => this.track(item));
  }

  list(): DownloadItemState[] {
    return [...this.states.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  /** Chrome-like: save straight into ~/Downloads with a unique name instead of prompting. */
  private static uniquePath(filename: string): string {
    const dir = process.env.VELA_DOWNLOAD_DIR ?? app.getPath('downloads');
    const ext = extname(filename);
    const base = filename.slice(0, filename.length - ext.length) || 'download';
    let candidate = join(dir, filename);
    for (let i = 1; existsSync(candidate); i++) candidate = join(dir, `${base} (${i})${ext}`);
    return candidate;
  }

  private track(item: DownloadItem): void {
    const id = crypto.randomUUID();
    item.setSavePath(DownloadManager.uniquePath(item.getFilename() || 'download'));
    this.items.set(id, item);
    let lastSaved = 0;
    const update = (state: DownloadItemState['state'], ended = false): void => {
      const s: DownloadItemState = {
        id,
        url: item.getURL(),
        filename: item.getFilename() || basename(item.getSavePath()),
        path: item.getSavePath(),
        state,
        paused: item.isPaused(),
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        startedAt: this.states.get(id)?.startedAt ?? Date.now(),
        endedAt: ended ? Date.now() : null,
      };
      this.states.set(id, s);
      if (ended || state !== 'progressing' || Date.now() - lastSaved > 1000) {
        lastSaved = Date.now();
        this.repo.save(s);
      }
      this.notify();
    };
    update('progressing');
    item.on('updated', (_e, state) => update(state === 'interrupted' ? 'interrupted' : 'progressing'));
    item.once('done', (_e, state) => {
      update(state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted', true);
      this.items.delete(id);
      if (state === 'completed' && process.platform === 'darwin') {
        // Bounce the dock icon like Chrome does.
        void import('electron').then(({ app }) => app.dock?.downloadFinished(item.getSavePath()));
      }
    });
  }

  action(id: string, action: 'pause' | 'resume' | 'cancel' | 'open' | 'showInFolder' | 'remove'): void {
    const item = this.items.get(id);
    const state = this.states.get(id);
    switch (action) {
      case 'pause':
        item?.pause();
        break;
      case 'resume':
        if (item?.canResume()) item.resume();
        break;
      case 'cancel':
        item?.cancel();
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
