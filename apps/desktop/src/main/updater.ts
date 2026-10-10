import type { UpdateStatus } from '@vela/shared';
import { app } from 'electron';
import type { AppUpdater } from 'electron-updater';
import type { AppContext } from './context';
import { emit } from './ipc/typed';

const CHECK_INTERVAL_MS = 6 * 3600 * 1000;

export class UpdateManager {
  status: UpdateStatus = { state: 'idle', version: null, notes: null, progress: 0, error: null };
  private timer: NodeJS.Timeout | null = null;
  private enabled = app.isPackaged || !!process.env.VELA_UPDATE_URL;

  private updater: AppUpdater | null = null;

  constructor(private readonly ctx: Pick<AppContext, 'windows' | 'prefs' | 'overlay'>) {}

  /** electron-updater (and its fs-extra/js-yaml graph) is only loaded on the first check. */
  private async load(): Promise<AppUpdater> {
    if (this.updater) return this.updater;
    const { autoUpdater } = await import('electron-updater');
    this.updater = autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = null;
    const feed = process.env.VELA_UPDATE_URL;
    if (feed) {
      autoUpdater.forceDevUpdateConfig = true;
      autoUpdater.setFeedURL({ provider: 'generic', url: feed });
    }
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking', error: null }));
    autoUpdater.on('update-available', (info) =>
      this.set({ state: 'available', version: info.version, notes: notesOf(info.releaseNotes) }),
    );
    autoUpdater.on('update-not-available', () => this.set({ state: 'up-to-date', version: null }));
    autoUpdater.on('download-progress', (p) => this.set({ state: 'downloading', progress: p.percent }));
    autoUpdater.on('update-downloaded', (info) => {
      this.set({
        state: 'downloaded',
        version: info.version,
        notes: notesOf(info.releaseNotes),
        progress: 100,
      });
      const payload = { version: info.version, notes: this.status.notes };
      if (this.ctx.overlay.visible)
        this.ctx.overlay.onHide(
          () => this.ctx.overlay.visible || this.ctx.overlay.show('updateNotes', payload),
        );
      else this.ctx.overlay.show('updateNotes', payload);
    });
    autoUpdater.on('error', (err) => this.set({ state: 'error', error: err.message }));
    return autoUpdater;
  }

  start(): void {
    if (!this.enabled || !this.ctx.prefs.value.autoUpdate) return;
    setTimeout(() => void this.check(), 15_000);
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async check(): Promise<UpdateStatus> {
    if (!this.enabled) {
      this.set({ state: 'up-to-date', error: null });
      return this.status;
    }
    try {
      const updater = await this.load();
      await updater.checkForUpdates();
    } catch (err) {
      this.set({ state: 'error', error: err instanceof Error ? err.message : String(err) });
    }
    return this.status;
  }

  install(): void {
    if (this.status.state === 'downloaded') this.updater?.quitAndInstall(true, true);
  }

  private set(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch };
    const wc = this.ctx.windows.main?.win.webContents;
    if (wc) emit(wc, 'update/changed', this.status);
    const ov = this.ctx.overlay.view?.webContents;
    if (ov) emit(ov, 'update/changed', this.status);
  }
}

function notesOf(notes: unknown): string | null {
  if (typeof notes === 'string') return notes;
  if (Array.isArray(notes)) return notes.map((n: { note?: string | null }) => n.note ?? '').join('\n');
  return null;
}
