import type { IpcEventChannel, IpcEventMap, IpcInvokeChannel, IpcInvokeMap, VelaBridge } from '@vela/shared';
import { contextBridge, ipcRenderer } from 'electron';

// Inlined on purpose: a sandboxed preload must be a single file with no shared chunks.
const channel = (name: string): string => `vela:${name}`;

declare const location: { protocol: string } | undefined;
declare const window: {
  addEventListener: (type: 'keydown', cb: (e: KeyEvent) => void) => void;
};
interface KeyEvent {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  isTrusted: boolean;
}

// Unreserved browser shortcuts (mirror of UNRESERVED_SHORTCUTS in @vela/shared, inlined because a
// sandboxed preload must stay a single file). The page sees the key first; we only forward the
// id when it did not preventDefault(), and main validates the id again.
const UNRESERVED: [string, string][] = [
  ['pinTab', 'CmdOrCtrl+D'],
  ['nextTab', 'CmdOrCtrl+Alt+Down'],
  ['prevTab', 'CmdOrCtrl+Alt+Up'],
  ['back', 'CmdOrCtrl+['],
  ['forward', 'CmdOrCtrl+]'],
  ['findInPage', 'CmdOrCtrl+F'],
  ['zoomIn', 'CmdOrCtrl+='],
  ['zoomOut', 'CmdOrCtrl+-'],
  ['zoomReset', 'CmdOrCtrl+0'],
  ['readerMode', 'CmdOrCtrl+Alt+R'],
  ['toggleSidebar', 'CmdOrCtrl+S'],
  ['spaceNext', 'CmdOrCtrl+Alt+Right'],
  ['spacePrev', 'CmdOrCtrl+Alt+Left'],
  ...Array.from({ length: 9 }, (_, i): [string, string] => [`space${i + 1}`, `Ctrl+${i + 1}`]),
];
const ALIASES: Record<string, string[]> = {
  up: ['arrowup'],
  down: ['arrowdown'],
  left: ['arrowleft'],
  right: ['arrowright'],
  '=': ['=', '+'],
  '-': ['-', '_'],
};
function matches(e: KeyEvent, accelerator: string): boolean {
  const parts = accelerator.split('+');
  const key = (parts.pop() ?? '').toLowerCase();
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const isMac = process.platform === 'darwin';
  const cmdOrCtrl = mods.has('cmdorctrl');
  const wantCtrl = mods.has('ctrl') || (!isMac && cmdOrCtrl);
  const wantMeta = mods.has('cmd') || (isMac && cmdOrCtrl);
  if (
    e.ctrlKey !== wantCtrl ||
    e.metaKey !== wantMeta ||
    e.altKey !== mods.has('alt') ||
    e.shiftKey !== mods.has('shift')
  )
    return false;
  const pressed = e.key.toLowerCase();
  if ((ALIASES[key] ?? [key]).includes(pressed)) return true;
  if (/^[0-9]$/.test(key) && e.code === `Digit${key}`) return true;
  return /^[a-z]$/.test(key) && e.code === `Key${key.toUpperCase()}`;
}
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (!e.isTrusted) return;
    const hit = UNRESERVED.find(([, acc]) => matches(e, acc));
    if (!hit) return;
    // Page listeners run after this one (registered first); decide once dispatch has finished.
    setTimeout(() => {
      if (!e.defaultPrevented) ipcRenderer.send(channel('shortcut'), hit[0]);
    }, 0);
  });
}

/**
 * Preload for tab WebContents. Only internal `vela://` documents get a bridge; ordinary web pages
 * get nothing (main additionally gates every channel by sender).
 */
if (location?.protocol === 'vela:') {
  const bridge: VelaBridge = {
    platform: process.platform as VelaBridge['platform'],
    invoke<K extends IpcInvokeChannel>(ch: K, req: IpcInvokeMap[K]['req']): Promise<IpcInvokeMap[K]['res']> {
      return ipcRenderer.invoke(channel(ch), req) as Promise<IpcInvokeMap[K]['res']>;
    },
    send<K extends IpcInvokeChannel>(ch: K, req: IpcInvokeMap[K]['req']): void {
      ipcRenderer.send(channel(ch), req);
    },
    on<K extends IpcEventChannel>(ch: K, cb: (payload: IpcEventMap[K]) => void): () => void {
      const listener = (_e: Electron.IpcRendererEvent, payload: IpcEventMap[K]): void => cb(payload);
      ipcRenderer.on(channel(ch), listener);
      return () => ipcRenderer.removeListener(channel(ch), listener);
    },
  };
  contextBridge.exposeInMainWorld('vela', bridge);
}
