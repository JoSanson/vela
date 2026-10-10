import type { ExtensionInfo } from '@vela/shared';
import { dialog, type Extension, type Session } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrefsStore } from './prefs';
import type { SessionManager } from './sessions';

/**
 * Unpacked Chrome extensions (MV3 subset supported by Electron, see docs/EXTENSIONS.md).
 * Extensions are loaded into every tab session (default + profiles) and remembered in prefs.
 */
export class ExtensionManager {
  private loaded = new Map<string, { path: string; byPartition: Map<string, Extension> }>();

  constructor(
    private readonly prefs: PrefsStore,
    private readonly sessions: SessionManager,
  ) {
    sessions.addConfigurator((ses, partition) => {
      for (const [, entry] of this.loaded) void this.loadInto(ses, partition, entry.path);
    });
  }

  async init(): Promise<void> {
    for (const p of this.prefs.value.extensionPaths) {
      if (existsSync(join(p, 'manifest.json'))) await this.load(p, false);
    }
  }

  list(): ExtensionInfo[] {
    return [...this.loaded.entries()].map(([id, entry]) => {
      const ext = entry.byPartition.values().next().value;
      return {
        id,
        name: ext?.name ?? id,
        version: ext?.version ?? '',
        path: entry.path,
        enabled: true,
      };
    });
  }

  private async loadInto(ses: Session, partition: string, path: string): Promise<Extension | null> {
    try {
      const existing = ses.getAllExtensions().find((e) => e.path === path);
      const ext = existing ?? (await ses.extensions.loadExtension(path, { allowFileAccess: false }));
      const entry = this.loaded.get(ext.id) ?? { path, byPartition: new Map<string, Extension>() };
      entry.byPartition.set(partition, ext);
      this.loaded.set(ext.id, entry);
      return ext;
    } catch (err) {
      console.warn('[extensions] failed to load', path, err);
      return null;
    }
  }

  async load(path: string, remember = true): Promise<ExtensionInfo | null> {
    if (!existsSync(join(path, 'manifest.json'))) return null;
    let first: Extension | null = null;
    for (const partition of this.sessions.allPartitions()) {
      const ext = await this.loadInto(this.sessions.get(partition), partition, path);
      first = first ?? ext;
    }
    if (!first) return null;
    if (remember && !this.prefs.value.extensionPaths.includes(path)) {
      this.prefs.set({ extensionPaths: [...this.prefs.value.extensionPaths, path] });
    }
    return { id: first.id, name: first.name, version: first.version, path, enabled: true };
  }

  async pickAndLoad(parent: Electron.BrowserWindow | undefined): Promise<ExtensionInfo | null> {
    const opts = { title: 'Choose an unpacked extension folder', properties: ['openDirectory' as const] };
    const res = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
    const dir = res.filePaths[0];
    if (res.canceled || !dir) return null;
    return this.load(dir);
  }

  remove(id: string): void {
    const entry = this.loaded.get(id);
    if (!entry) return;
    for (const [partition] of entry.byPartition) {
      try {
        this.sessions.get(partition).extensions.removeExtension(id);
      } catch {
        /* already gone */
      }
    }
    this.loaded.delete(id);
    this.prefs.set({ extensionPaths: this.prefs.value.extensionPaths.filter((p) => p !== entry.path) });
  }

  /** URL of the action popup declared in the manifest, if any. */
  popupUrl(id: string): string | null {
    const entry = this.loaded.get(id);
    if (!entry) return null;
    try {
      const manifest = JSON.parse(readFileSync(join(entry.path, 'manifest.json'), 'utf8')) as {
        action?: { default_popup?: string };
        browser_action?: { default_popup?: string };
      };
      const popup = manifest.action?.default_popup ?? manifest.browser_action?.default_popup;
      return popup ? `chrome-extension://${id}/${popup.replace(/^\/+/, '')}` : null;
    } catch {
      return null;
    }
  }
}
