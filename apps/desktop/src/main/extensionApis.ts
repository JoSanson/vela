import type { Id } from '@vela/core';
import { session, type BrowserWindow, type Extension, type Session, type WebContents } from 'electron';
import { ElectronChromeExtensions } from 'electron-chrome-extensions';
import { preloadPath } from './context';
import type { TabManager } from './tabs/tabManager';
import type { WindowManager } from './windows/windowManager';

export interface ExtensionApiDeps {
  tabs: TabManager;
  windows: WindowManager;
  activateTab: (tabId: Id) => void;
  /** `chrome.permissions.request`: resolves true when the user grants them. */
  confirmPermissions: (extension: Extension, permissions: string[]) => Promise<boolean>;
}

/**
 * The chrome.* APIs Electron does not implement (tabs, windows, action, contextMenus, cookies,
 * permissions, webNavigation, commands, notifications), provided by electron-chrome-extensions
 * (GPL-3.0, D035) and mapped onto Vela's own tabs: an extension that opens, activates or closes a
 * tab drives the sidebar, not a hidden Chromium tab strip.
 */
export class ExtensionApis {
  private bySession = new Map<Session, ElectronChromeExtensions>();

  constructor(private readonly deps: ExtensionApiDeps) {
    // Icons for the sidebar's <browser-action-list>, which lives in the shell's (default) session.
    ElectronChromeExtensions.handleCRXProtocol(session.defaultSession);
    deps.tabs.onViewCreated((tabId, wc) => this.add(tabId, wc));
    deps.tabs.onVisibilityChange((tabId, visible) => {
      if (visible && tabId === deps.tabs.activeTabId()) this.select(tabId);
    });
  }

  /** Must run before the session loads any extension, so the API preloads are registered first. */
  attach(ses: Session): void {
    if (this.bySession.has(ses)) return;
    const { tabs } = this.deps;
    this.bySession.set(
      ses,
      new ElectronChromeExtensions({
        license: 'GPL-3.0',
        session: ses,
        createTab: (details) => {
          const id = tabs.openUrl({
            input: details.url ?? 'about:blank',
            activate: details.active !== false,
            noAtc: true,
          });
          const wc = tabs.webContents(id) ?? tabs.loadInBackground(id);
          const win = this.windowFor(id);
          if (!wc || !win) return Promise.reject(new Error('no window to open the tab in'));
          return Promise.resolve([wc, win]);
        },
        selectTab: (wc) => {
          const id = tabs.tabIdOf(wc);
          if (id) this.deps.activateTab(id);
        },
        removeTab: (wc) => {
          const id = tabs.tabIdOf(wc);
          if (id) tabs.close(id);
        },
        // Vela has no popup windows: an extension asking for one gets the main window, and the
        // URL (if any) opens as a tab there.
        createWindow: (details) => {
          const urls = typeof details.url === 'string' ? [details.url] : (details.url ?? []);
          for (const url of urls) tabs.openUrl({ input: url, noAtc: true });
          const win = this.deps.windows.main?.win;
          return win ? Promise.resolve(win) : Promise.reject(new Error('no window'));
        },
        removeWindow: () => undefined,
        requestPermissions: (extension, permissions) =>
          this.deps.confirmPermissions(extension, [
            ...(permissions.permissions ?? []),
            ...(permissions.origins ?? []),
          ]),
      }),
    );
    // Registered after the library's preloads, so it sees their finished `chrome` object.
    for (const type of ['service-worker', 'frame'] as const)
      ses.registerPreloadScript({
        id: `vela-extension-compat-${type}`,
        type,
        filePath: preloadPath('extensionCompat'),
      });
  }

  private windowFor(tabId: Id): BrowserWindow | undefined {
    return this.deps.tabs.windowOf(tabId)?.win ?? this.deps.windows.main?.win;
  }

  private add(tabId: Id, wc: WebContents): void {
    const api = this.bySession.get(wc.session);
    const win = this.windowFor(tabId);
    if (api && win) api.addTab(wc, win);
  }

  private select(tabId: Id): void {
    const wc = this.deps.tabs.webContents(tabId);
    if (wc) this.bySession.get(wc.session)?.selectTab(wc);
  }
}
