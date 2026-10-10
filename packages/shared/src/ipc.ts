import type { ArchivedTab, CoreAction, CoreState, Id, TabKind } from '@vela/core';
import type { Prefs } from './prefs';

export type Platform = 'darwin' | 'win32' | 'linux';

export interface ShellSnapshot {
  state: CoreState;
  prefs: Prefs;
  version: string;
  platform: Platform;
  windowId: number;
  /** Which tab (if any) this window is a "Little" window for. */
  little: { tabId: Id } | null;
}

export interface Layout {
  sidebarWidth: number;
  sidebarVisible: boolean;
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

export interface CertificateInfo {
  url: string;
  error: string;
  issuer: string;
  subject: string;
  validFrom: number;
  validTo: number;
  fingerprint: string;
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
  'tab/pip': { req: { tabId: Id; enter: boolean }; res: boolean };

  'layout/set': { req: Layout; res: undefined };
  'window/action': {
    req: { action: 'minimize' | 'maximize' | 'close' | 'fullscreen' | 'new' | 'little' };
    res: undefined;
  };
  'window/isFullscreen': { req: undefined; res: boolean };
  'little/sendToMain': { req: { tabId: Id; spaceId: Id }; res: undefined };

  'overlay/show': { req: { kind: OverlayKind; payload?: unknown }; res: undefined };
  'overlay/hide': { req: undefined; res: undefined };

  'suggest/query': { req: { query: string }; res: SuggestionResult };
  'history/search': { req: { query: string; limit?: number; offset?: number }; res: HistoryEntry[] };
  'history/delete': { req: { ids?: number[]; all?: boolean; url?: string }; res: undefined };
  'archive/search': { req: { query: string; limit?: number }; res: ArchivedTab[] };

  'downloads/list': { req: undefined; res: DownloadItemState[] };
  'downloads/action': {
    req: { id: string; action: 'pause' | 'resume' | 'cancel' | 'open' | 'showInFolder' | 'remove' };
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

  'theme/fromImage': { req: undefined; res: ThemePalette | null };
  'app/openExternal': { req: { url: string }; res: undefined };
  'app/relaunch': { req: undefined; res: undefined };
  'app/pickFile': {
    req: { title: string; filters?: { name: string; extensions: string[] }[] };
    res: string | null;
  };
  'app/readFile': { req: { path: string }; res: string };
}

export type OverlayKind =
  | 'commandBar'
  | 'sidebar'
  | 'switcher'
  | 'peek'
  | 'zap'
  | 'permissionPrompt'
  | 'siteControl'
  | 'updateNotes'
  | 'none';

export interface OverlayState {
  kind: OverlayKind;
  payload: unknown;
}

/** Main → renderer events. */
export interface IpcEventMap {
  'state/changed': CoreState;
  'prefs/changed': Prefs;
  'overlay/changed': OverlayState;
  'ui/command': { id: string; payload?: unknown };
  'find/result': FindResult;
  'downloads/changed': DownloadItemState[];
  'permissions/prompt': PermissionPrompt;
  'update/changed': UpdateStatus;
  'certificate/error': CertificateInfo & { tabId: Id };
  'window/fullscreen': boolean;
  'zap/pick': { tabId: Id; selector: string };
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
}
