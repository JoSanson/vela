import type { ExtensionInfo } from '@vela/shared';
import { dialog, type Extension, type NativeImage, type Session } from 'electron';
import { installChromeWebStore, uninstallExtension } from 'electron-chrome-web-store';
import { existsSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import type { ExtensionApis } from './extensionApis';
import { permissionWarnings, type PermissionManifest } from './extensionPermissions';
import type { PrefsStore } from './prefs';
import { DEFAULT_PARTITION, type SessionManager } from './sessions';

export const WEB_STORE_URL = 'https://chromewebstore.google.com/';

/** What the Web Store hands us before an install, enough to ask the user. */
export interface StoreInstallRequest {
  localizedName: string;
  manifest: PermissionManifest;
  icon: NativeImage;
}

export interface ExtensionManagerOptions {
  /** Where Web Store extensions are unpacked, one folder per id/version, shared by every profile. */
  storeDir: string;
  /** chrome.* APIs Electron lacks; attached to a session before it loads any extension. */
  apis: ExtensionApis;
  /** Resolves true when the user agreed to add the extension. */
  confirmInstall: (
    req: StoreInstallRequest,
    warnings: ReturnType<typeof permissionWarnings>,
  ) => Promise<boolean>;
}

/**
 * Chrome extensions, from the Chrome Web Store or unpacked folders (MV3 subset supported by
 * Electron, see docs/EXTENSIONS.md). Every extension is loaded into every tab session (default +
 * profiles): installing from one Space makes it available in all of them, like Arc and Chrome
 * profiles sharing a browser. Unpacked folders are remembered in prefs; Web Store ones live in
 * `storeDir` and are reloaded and updated by electron-chrome-web-store.
 */
export class ExtensionManager {
  private loaded = new Map<string, { path: string; byPartition: Map<string, Extension> }>();
  /** Remembered folders not yet loaded anywhere (tab sessions are created lazily). */
  private pending = new Set<string>();
  /** Only one session runs the 5-hourly update check; the others pick updates up by propagation. */
  private updater: string | null = null;

  constructor(
    private readonly prefs: PrefsStore,
    private readonly sessions: SessionManager,
    private readonly opts: ExtensionManagerOptions,
  ) {
    sessions.addConfigurator((ses, partition) => {
      opts.apis.attach(ses);
      const paths = new Set<string>([...this.pending, ...[...this.loaded.values()].map((e) => e.path)]);
      this.pending.clear();
      for (const p of paths) void this.loadInto(ses, partition, p);
      void this.enableWebStore(ses, partition);
    });
  }

  async init(): Promise<void> {
    // Tab sessions are created lazily; the default one is needed now so Web Store extensions are
    // reloaded (and listed, and updated) at launch, not when the first tab happens to open.
    this.sessions.get(DEFAULT_PARTITION);
    for (const p of this.prefs.value.extensionPaths) {
      if (!existsSync(join(p, 'manifest.json'))) continue;
      if (this.sessions.allPartitions().length === 0) this.pending.add(p);
      else await this.load(p, false);
    }
  }

  private isStorePath(path: string): boolean {
    return path.startsWith(this.opts.storeDir + sep);
  }

  private async enableWebStore(ses: Session, partition: string): Promise<void> {
    this.updater ??= partition;
    ses.extensions.on('extension-loaded', (_e, ext) => void this.propagateLoad(ext, partition));
    ses.extensions.on('extension-unloaded', (_e, ext) => this.propagateUnload(ext, partition));
    try {
      await installChromeWebStore({
        session: ses,
        extensionsPath: this.opts.storeDir,
        autoUpdate: this.updater === partition,
        loadExtensions: true,
        allowUnpackedExtensions: false,
        beforeInstall: async (details) => {
          const req = details as unknown as StoreInstallRequest;
          const ok = await this.opts.confirmInstall(req, permissionWarnings(req.manifest));
          return { action: ok ? 'allow' : 'deny' };
        },
      });
    } catch (err) {
      console.warn('[extensions] Chrome Web Store unavailable in', partition, err);
    }
  }

  /** A Web Store extension appeared (install or update) in one session: load that version everywhere. */
  private async propagateLoad(ext: Extension, from: string): Promise<void> {
    if (!this.isStorePath(ext.path)) return;
    for (const partition of this.sessions.allPartitions()) {
      if (partition === from) continue;
      const ses = this.sessions.get(partition);
      const current = ses.extensions.getExtension(ext.id);
      if (current?.path === ext.path) continue;
      try {
        if (current) ses.extensions.removeExtension(ext.id);
        await ses.extensions.loadExtension(ext.path, { allowFileAccess: false });
      } catch (err) {
        console.warn('[extensions] could not share', ext.name, 'with', partition, err);
      }
    }
  }

  /** Uninstalled from the Web Store page (its folder is gone): unload it from the other sessions too. */
  private propagateUnload(ext: Extension, from: string): void {
    if (!this.isStorePath(ext.path) || existsSync(ext.path)) return;
    for (const partition of this.sessions.allPartitions()) {
      if (partition === from) continue;
      const ses = this.sessions.get(partition);
      if (ses.extensions.getExtension(ext.id)?.path === ext.path) ses.extensions.removeExtension(ext.id);
    }
  }

  list(): ExtensionInfo[] {
    const out = new Map<string, ExtensionInfo>();
    for (const [id, entry] of this.loaded) {
      const ext = entry.byPartition.values().next().value;
      out.set(id, {
        id,
        name: ext?.name ?? id,
        version: ext?.version ?? '',
        path: entry.path,
        enabled: true,
        source: 'unpacked',
      });
    }
    for (const partition of this.sessions.allPartitions()) {
      for (const ext of this.sessions.get(partition).extensions.getAllExtensions()) {
        if (!this.isStorePath(ext.path) || out.has(ext.id)) continue;
        out.set(ext.id, {
          id: ext.id,
          name: ext.name,
          version: ext.version,
          path: ext.path,
          enabled: true,
          source: 'webstore',
        });
      }
    }
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private async loadInto(ses: Session, partition: string, path: string): Promise<Extension | null> {
    try {
      const existing = ses.extensions.getAllExtensions().find((e) => e.path === path);
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
    if (this.sessions.allPartitions().length === 0) this.sessions.get(DEFAULT_PARTITION);
    let first: Extension | null = null;
    for (const partition of this.sessions.allPartitions()) {
      const ext = await this.loadInto(this.sessions.get(partition), partition, path);
      first = first ?? ext;
    }
    if (!first) return null;
    if (remember && !this.prefs.value.extensionPaths.includes(path)) {
      this.prefs.set({ extensionPaths: [...this.prefs.value.extensionPaths, path] });
    }
    return {
      id: first.id,
      name: first.name,
      version: first.version,
      path,
      enabled: true,
      source: 'unpacked',
    };
  }

  async pickAndLoad(
    parent: Electron.BrowserWindow | undefined,
    title: string,
  ): Promise<ExtensionInfo | null> {
    const opts = { title, properties: ['openDirectory' as const] };
    const res = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
    const dir = res.filePaths[0];
    if (res.canceled || !dir) return null;
    return this.load(dir);
  }

  async remove(id: string): Promise<void> {
    const entry = this.loaded.get(id);
    if (entry) {
      for (const [partition] of entry.byPartition) {
        try {
          this.sessions.get(partition).extensions.removeExtension(id);
        } catch {
          /* already gone */
        }
      }
      this.loaded.delete(id);
      this.prefs.set({ extensionPaths: this.prefs.value.extensionPaths.filter((p) => p !== entry.path) });
      return;
    }
    // Web Store: the first session deletes the folder, the unload event clears the others.
    const holders = this.sessions
      .allPartitions()
      .filter((p) => this.sessions.get(p).extensions.getExtension(id));
    const [first, ...rest] = holders;
    if (!first) return;
    await uninstallExtension(id, { session: this.sessions.get(first), extensionsPath: this.opts.storeDir });
    for (const p of rest) {
      const ses = this.sessions.get(p);
      if (ses.extensions.getExtension(id)) ses.extensions.removeExtension(id);
    }
  }

  /** URL of the action popup declared in the manifest, if any. */
  popupUrl(id: string): string | null {
    const path = this.loaded.get(id)?.path ?? this.list().find((e) => e.id === id)?.path;
    if (!path) return null;
    try {
      const manifest = JSON.parse(readFileSync(join(path, 'manifest.json'), 'utf8')) as {
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
