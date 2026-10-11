import type { ArchivedTab, CoreAction, CoreState, Id, TabKind, StateDelta } from '@vela/core';
import type { Prefs } from './prefs';

export type Platform = 'darwin' | 'win32' | 'linux';

export interface ShellSnapshot {
  state: CoreState;
  prefs: Prefs;
  version: string;
  platform: Platform;
  windowId: number;
  overlay: OverlayState;
  /** Revision of `state`; deltas carry `fromRev`/`rev` so a missed message triggers a resync. */
  rev: number;
  /** The Space this window (or the overlay's host window) displays; null for internal pages. */
  spaceId: Id | null;
  /** Per-launch secret inserted into `vela://favicon/` URLs by the renderer. */
  faviconToken: string;
  /** Which tab (if any) this window is a "Little" window for. */
  little: { tabId: Id } | null;
  /** OS language (BCP 47); the UI locale is `resolveLocale(prefs.language, systemLocale)`. */
  systemLocale: string;
}

export interface Layout {
  sidebarWidth: number;
  sidebarVisible: boolean;
  /** Height reserved at the top of the content area (find bar, reader toolbar). */
  topStrip?: number;
}

export type ContextMenuKind = 'tab' | 'folder' | 'space' | 'favorite' | 'today' | 'pinnedArea' | 'urlPill';

export interface LittleState {
  url: string;
  title: string;
  favicon: string | null;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface PeekState {
  url: string;
  title: string;
  favicon: string | null;
  loading: boolean;
  canGoBack: boolean;
  /** Content rect of the peek view in window coordinates. */
  rect: { x: number; y: number; width: number; height: number };
}

export interface HistoryEntry {
  id: number;
  url: string;
  title: string;
  favicon: string | null;
  visitedAt: number;
  visitCount: number;
}

export interface DownloadItemState {
  id: string;
  url: string;
  filename: string;
  path: string;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  paused: boolean;
  receivedBytes: number;
  totalBytes: number;
  startedAt: number;
  endedAt: number | null;
  /** Executable or installer held until the user explicitly keeps it. */
  dangerous?: boolean;
}

export type PermissionKind =
  | 'notifications'
  | 'geolocation'
  | 'media'
  | 'camera'
  | 'microphone'
  | 'clipboard-read'
  | 'midi'
  | 'pointerLock'
  | 'fullscreen'
  | 'display-capture'
  | 'idle-detection'
  | 'other';

export interface SitePermission {
  origin: string;
  permission: PermissionKind;
  decision: 'allow' | 'deny';
  updatedAt: number;
}

export interface PermissionPrompt {
  id: string;
  tabId: Id;
  origin: string;
  permission: PermissionKind;
}

/** HTTP (or proxy) authentication challenge waiting for credentials. */
export interface AuthPrompt {
  id: string;
  tabId: Id;
  host: string;
  realm: string;
  isProxy: boolean;
}

/** A page tried to open another application (custom URL scheme). */
export interface ExternalPrompt {
  id: string;
  tabId: Id;
  url: string;
  scheme: string;
  host: string;
}

/** A stored login, never with its secret (secrets leave main only to fill a field). */
export interface CredentialSummary {
  id: string;
  origin: string;
  username: string;
  updatedAt: number;
  lastUsedAt: number | null;
}

/** Page → main: a login field got focus (rect in page CSS px). */
export interface CredentialFocus {
  rect: { x: number; y: number; width: number; height: number };
  field: 'username' | 'password';
}

/** Overlay payload: accounts to offer for the focused field. */
export interface AutofillPrompt {
  tabId: Id;
  origin: string;
  accounts: CredentialSummary[];
  /** Window coordinates of the field. */
  anchor: { x: number; y: number; width: number; height: number };
}

/** Overlay payload: a login just happened and is not stored yet (or changed). */
export interface SavePasswordPrompt {
  id: string;
  tabId: Id;
  origin: string;
  username: string;
  update: boolean;
}

export interface ClearDataRequest {
  history: boolean;
  cookies: boolean;
  cache: boolean;
  storage: boolean;
  downloads: boolean;
}

export interface Boost {
  id: Id;
  host: string;
  enabled: boolean;
  css: string;
  js: string;
  /** CSS selectors hidden through Zap. */
  zapped: string[];
  font: string | null;
  updatedAt: number;
}

export interface SuggestionResult {
  query: string;
  suggestions: string[];
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'up-to-date';
  version: string | null;
  notes: string | null;
  progress: number;
  error: string | null;
}

export interface BrowserImportSource {
  id: 'chrome' | 'brave' | 'edge';
  name: string;
  available: boolean;
}

export interface ImportResult {
  bookmarks: number;
  history: number;
}

export interface OpenUrlRequest {
  input: string;
  spaceId?: Id;
  activate?: boolean;
  kind?: TabKind;
  /** Where to insert in Today (default top). */
  index?: number;
  /** Bypass ATC routing. */
  noAtc?: boolean;
}

export interface FindRequest {
  tabId: Id;
  text: string;
  forward: boolean;
  findNext: boolean;
  matchCase?: boolean;
}

export interface FindResult {
  tabId: Id;
  activeMatchOrdinal: number;
  matches: number;
  finalUpdate: boolean;
}

export interface TabPreview {
  tabId: Id;
  dataUrl: string | null;
}

export interface ReaderResult {
  title: string;
  byline: string | null;
  content: string;
  length: number;
}

export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
}

export interface ThemePalette {
  from: string;
  to: string;
}

export interface BlockerStats {
  enabled: boolean;
  enabledForHost: boolean;
  host: string;
  blockedOnTab: number;
  blockedTotal: number;
}

/** Renderer → main request/response contract. Channel names are `vela:` + key. */
export interface IpcInvokeMap {
  'snapshot/get': { req: undefined; res: ShellSnapshot };
  'state/dispatch': { req: CoreAction; res: undefined };
  'prefs/set': { req: Partial<Prefs>; res: Prefs };

  'tab/openUrl': { req: OpenUrlRequest; res: Id };
  'tab/navigate': { req: { tabId: Id; input: string }; res: undefined };
  'tab/back': { req: { tabId: Id }; res: undefined };
  'tab/forward': { req: { tabId: Id }; res: undefined };
  'tab/reload': { req: { tabId: Id; ignoreCache?: boolean }; res: undefined };
  'tab/stop': { req: { tabId: Id }; res: undefined };
  'tab/close': { req: { tabId: Id }; res: undefined };
  'tab/reopenClosed': { req: undefined; res: Id | null };
  'tab/setMuted': { req: { tabId: Id; muted: boolean }; res: undefined };
  'tab/setZoom': { req: { tabId: Id; zoom: number }; res: number };
  'tab/sleep': { req: { tabId: Id }; res: undefined };
  'tab/wake': { req: { tabId: Id }; res: undefined };
  'tab/devtools': { req: { tabId: Id }; res: undefined };
  'tab/find': { req: FindRequest; res: undefined };
  'tab/stopFind': {
    req: { tabId: Id; action: 'clearSelection' | 'keepSelection' | 'activateSelection' };
    res: undefined;
  };
  'tab/preview': { req: { tabId: Id; width: number }; res: TabPreview };
  'tab/reader': { req: { tabId: Id }; res: ReaderResult | null };

  'layout/set': { req: Layout; res: undefined };
  'window/action': {
    req: { action: 'minimize' | 'maximize' | 'close' | 'fullscreen' | 'new' | 'little' };
    res: undefined;
  };
  'window/isFullscreen': { req: undefined; res: boolean };
  'little/sendToMain': { req: { spaceId: Id | null }; res: undefined };
  'little/action': {
    req: { action: 'back' | 'forward' | 'reload' | 'stop' | 'navigate' | 'close'; input?: string };
    res: undefined;
  };
  'little/state': { req: undefined; res: LittleState | null };

  'command/run': { req: { id: string; payload?: unknown }; res: undefined };
  /** Renderer performance marks (ms since the renderer's timeOrigin is meaningless across processes, so we send Date.now()). */
  'perf/mark': { req: { name: string; at: number }; res: undefined };
  'perf/marks': { req: undefined; res: Record<string, number> };
  'menu/show': { req: { kind: ContextMenuKind; id?: Id; x?: number; y?: number }; res: undefined };

  'peek/open': { req: { url: string; fromTabId?: Id }; res: undefined };
  'peek/action': { req: { action: 'close' | 'openAsTab' | 'back' | 'reload' }; res: undefined };

  'overlay/show': { req: { kind: OverlayKind; payload?: unknown }; res: undefined };
  'overlay/hide': { req: undefined; res: undefined };

  'suggest/query': { req: { query: string }; res: SuggestionResult };
  'history/search': { req: { query: string; limit?: number; offset?: number }; res: HistoryEntry[] };
  'history/delete': { req: { ids?: number[]; all?: boolean; url?: string }; res: undefined };
  'archive/search': { req: { query: string; limit?: number }; res: ArchivedTab[] };

  'downloads/list': { req: undefined; res: DownloadItemState[] };
  'downloads/action': {
    req: {
      id: string;
      action: 'pause' | 'resume' | 'cancel' | 'open' | 'showInFolder' | 'remove' | 'retry' | 'keep';
    };
    res: undefined;
  };
  'downloads/clear': { req: undefined; res: undefined };

  'permissions/list': { req: undefined; res: SitePermission[] };
  'permissions/set': { req: SitePermission; res: undefined };
  'permissions/remove': { req: { origin: string; permission: PermissionKind }; res: undefined };
  'permissions/respond': {
    req: { id: string; decision: 'allow' | 'deny'; remember: boolean };
    res: undefined;
  };

  'boosts/list': { req: undefined; res: Boost[] };
  'boosts/save': { req: Boost; res: undefined };
  'boosts/delete': { req: { id: Id }; res: undefined };
  'boosts/zap': { req: { tabId: Id; enable: boolean }; res: undefined };
  'boosts/export': { req: undefined; res: string };
  'boosts/import': { req: { json: string }; res: number };

  'certificate/trust': { req: { fingerprint: string; tabId: Id }; res: undefined };

  'import/sources': { req: undefined; res: BrowserImportSource[] };
  'import/run': {
    req: { source: BrowserImportSource['id']; bookmarks: boolean; history: boolean };
    res: ImportResult;
  };
  'export/state': { req: undefined; res: string };
  'export/saveToFile': { req: undefined; res: string | null };
  'import/state': { req: { json: string }; res: undefined };
  'import/fromFile': { req: undefined; res: boolean };

  'update/check': { req: undefined; res: UpdateStatus };
  'update/status': { req: undefined; res: UpdateStatus };
  'update/install': { req: undefined; res: undefined };

  'blocker/stats': { req: { tabId: Id }; res: BlockerStats };
  'blocker/setHost': { req: { host: string; enabled: boolean }; res: undefined };

  'extensions/list': { req: undefined; res: ExtensionInfo[] };
  'extensions/load': { req: { path?: string }; res: ExtensionInfo | null };
  'extensions/remove': { req: { id: string }; res: undefined };
  'extensions/popup': { req: { id: string }; res: boolean };

  'theme/fromImage': { req: undefined; res: ThemePalette | null };
  'theme/fromImagePath': { req: { path: string }; res: ThemePalette | null };
  'app/openExternal': { req: { url: string }; res: undefined };
  'app/relaunch': { req: undefined; res: undefined };
  'app/defaultBrowser': { req: { set?: boolean }; res: boolean };
  'app/openFile': { req: undefined; res: Id | null };
  'auth/respond': { req: { id: string; username: string | null; password: string | null }; res: undefined };
  'external/respond': { req: { id: string; allow: boolean; remember: boolean }; res: undefined };
  'tab/openPath': { req: { path: string }; res: Id | null };
  'downloads/pickDir': { req: undefined; res: string | null };
  'privacy/clear': { req: ClearDataRequest; res: undefined };
  'tab/print': { req: { tabId: Id }; res: undefined };
  'safebrowsing/allow': { req: { host: string }; res: undefined };
  /** Page preload: the unreserved shortcut table (id, accelerator) with the user's overrides. */
  'shortcuts/table': { req: undefined; res: [string, string][] };
  'credentials/focus': { req: CredentialFocus | null; res: undefined };
  'credentials/submitted': { req: { username: string; password: string }; res: undefined };
  'credentials/list': { req: { query?: string }; res: CredentialSummary[] };
  'credentials/remove': { req: { id: string }; res: undefined };
  'credentials/reveal': { req: { id: string }; res: string | null };
  'credentials/never': { req: { origin?: string; remove?: string }; res: string[] };
  'credentials/useFill': { req: { tabId: Id; id: string }; res: undefined };
  'credentials/respond': { req: { id: string; action: 'save' | 'never' | 'dismiss' }; res: undefined };
  'tab/savePage': { req: { tabId: Id }; res: boolean };
}

export type OverlayKind =
  | 'commandBar'
  | 'sidebar'
  | 'switcher'
  | 'spaceEditor'
  | 'peek'
  | 'zap'
  | 'permissionPrompt'
  | 'authPrompt'
  | 'externalPrompt'
  | 'toast'
  | 'autofill'
  | 'savePassword'
  | 'siteControl'
  | 'updateNotes'
  | 'none';

export interface OverlayState {
  kind: OverlayKind;
  payload: unknown;
}

/** Main → renderer events. */
export interface IpcEventMap {
  'state/changed': StateDelta;
  'prefs/changed': Prefs;
  'overlay/changed': OverlayState;
  'ui/command': { id: string; payload?: unknown };
  'find/result': FindResult;
  'downloads/changed': DownloadItemState[];
  'permissions/prompt': PermissionPrompt;
  'auth/prompt': AuthPrompt;
  'external/prompt': ExternalPrompt;
  'credentials/autofill': AutofillPrompt | null;
  'credentials/savePrompt': SavePasswordPrompt;
  /** Main → page preload: fill the focused login form. */
  'credentials/fill': { username: string; password: string };
  'update/changed': UpdateStatus;
  'window/fullscreen': boolean;
  /** This window now displays another Space (multi-window, D024). */
  'window/space': Id;
  'shortcuts/changed': [string, string][];
  'zap/pick': { tabId: Id; selector: string };
  'little/changed': LittleState;
  'peek/changed': PeekState | null;
}

export type IpcInvokeChannel = keyof IpcInvokeMap;
export type IpcEventChannel = keyof IpcEventMap;

export const IPC_PREFIX = 'vela:';

export function channel(name: string): string {
  return IPC_PREFIX + name;
}

/** API exposed on `window.vela` by the preload. */
export interface VelaBridge {
  platform: Platform;
  invoke<K extends IpcInvokeChannel>(ch: K, req: IpcInvokeMap[K]['req']): Promise<IpcInvokeMap[K]['res']>;
  /** Fire-and-forget (used for per-frame layout updates). */
  send<K extends IpcInvokeChannel>(ch: K, req: IpcInvokeMap[K]['req']): void;
  on<K extends IpcEventChannel>(ch: K, cb: (payload: IpcEventMap[K]) => void): () => void;
  /** Shell only: the OS path of a dropped File (webUtils), for opening local files. */
  pathForFile?: (file: File) => string;
}
