import type { IpcEventChannel, IpcEventMap, IpcInvokeChannel, IpcInvokeMap, VelaBridge } from '@vela/shared';
import { contextBridge, ipcRenderer } from 'electron';

// Inlined on purpose: a sandboxed preload must be a single file with no shared chunks.
const channel = (name: string): string => `vela:${name}`;

declare const location: { protocol: string } | undefined;
declare const window: {
  addEventListener: (type: 'keydown', cb: (e: KeyEvent) => void, capture?: boolean) => void;
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
// The user's own accelerators replace the defaults once main answers (and whenever they change).
let shortcutTable: [string, string][] = UNRESERVED;
if (typeof window !== 'undefined' && location?.protocol !== 'vela:') {
  ipcRenderer
    .invoke(channel('shortcuts/table'))
    .then((t: unknown) => {
      if (Array.isArray(t)) shortcutTable = t as [string, string][];
    })
    .catch(() => undefined);
  ipcRenderer.on(channel('shortcuts/changed'), (_e, t: [string, string][]) => {
    shortcutTable = t;
  });
}
if (typeof window !== 'undefined') {
  // Capture phase so a page calling stopPropagation() cannot hide the key; the decision itself
  // waits until the whole dispatch (page listeners included) has run.
  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.isTrusted) return;
      const hit = shortcutTable.find(([, acc]) => matches(e, acc));
      if (!hit) return;
      setTimeout(() => {
        if (!e.defaultPrevented) ipcRenderer.send(channel('shortcut'), hit[0]);
      }, 0);
    },
    true,
  );
}

/**
 * Password manager hooks for ordinary web pages. Runs in the isolated world: the page cannot see
 * these listeners, and nothing here exposes an API to it. Main validates the sender and derives the
 * origin from the frame URL, never from this code.
 */
declare const document:
  | {
      readonly readyState: string;
      addEventListener: (
        type: string,
        cb: (e: unknown) => void,
        opts?: boolean | { capture?: boolean },
      ) => void;
      querySelectorAll: (sel: string) => ArrayLike<HTMLElementLike>;
      readonly activeElement: HTMLElementLike | null;
    }
  | undefined;
interface HTMLElementLike {
  tagName: string;
  type?: string;
  name?: string;
  id?: string;
  value?: string;
  autocomplete?: string;
  form?: HTMLElementLike | null;
  closest: (sel: string) => HTMLElementLike | null;
  querySelectorAll: (sel: string) => ArrayLike<HTMLElementLike>;
  getBoundingClientRect: () => { x: number; y: number; width: number; height: number };
  dispatchEvent: (e: unknown) => boolean;
  isConnected: boolean;
}
declare const Event: new (type: string, init?: { bubbles?: boolean }) => unknown;

const USERNAME_SEL =
  'input[type="email"], input[type="text"], input[type="tel"], input:not([type]), input[autocomplete="username"]';
const PASSWORD_SEL = 'input[type="password"]';

function isPasswordField(el: HTMLElementLike | null): boolean {
  return !!el && el.tagName === 'INPUT' && (el.type ?? '').toLowerCase() === 'password';
}

/** The text/email input that precedes the password field in the same form (or document). */
function usernameFor(pw: HTMLElementLike): HTMLElementLike | null {
  const scope = pw.form ?? pw.closest('form') ?? document;
  if (!scope) return null;
  const inputs = Array.from(scope.querySelectorAll(USERNAME_SEL));
  let best: HTMLElementLike | null = null;
  for (const el of inputs) {
    if (!el.isConnected) continue;
    if (
      (el.autocomplete ?? '').includes('username') ||
      /user|email|login|mail/i.test(`${el.name ?? ''} ${el.id ?? ''}`)
    )
      return el;
    best = best ?? el;
  }
  return best;
}

function passwordFor(el: HTMLElementLike): HTMLElementLike | null {
  if (isPasswordField(el)) return el;
  const scope = el.form ?? el.closest('form') ?? document;
  if (!scope) return null;
  const pws = Array.from(scope.querySelectorAll(PASSWORD_SEL)).filter((p) => p.isConnected);
  return pws[0] ?? null;
}

function setValue(el: HTMLElementLike, value: string): void {
  // React/Vue listen to the native setter: go through the prototype so frameworks notice.
  const proto = Object.getPrototypeOf(el) as Record<string, unknown>;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc?.set) (desc.set as (this: unknown, v: string) => void).call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

if (
  typeof document !== 'undefined' &&
  location?.protocol !== 'vela:' &&
  /^https?:$/.test(location?.protocol ?? '')
) {
  let lastFocus: HTMLElementLike | null = null;
  const report = (el: HTMLElementLike | null): void => {
    if (!el) {
      ipcRenderer.send(channel('credentials/focus'), null);
      return;
    }
    const r = el.getBoundingClientRect();
    ipcRenderer.send(channel('credentials/focus'), {
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      field: isPasswordField(el) ? 'password' : 'username',
    });
  };
  document.addEventListener(
    'focusin',
    (e) => {
      const el = (e as { target: HTMLElementLike | null }).target;
      if (el?.tagName !== 'INPUT') return;
      const pw = passwordFor(el);
      if (!pw) return;
      if (!isPasswordField(el) && usernameFor(pw) !== el) return;
      lastFocus = el;
      report(el);
    },
    true,
  );
  document.addEventListener(
    'focusout',
    (e) => {
      if ((e as { target: unknown }).target !== lastFocus) return;
      lastFocus = null;
      // Delay: a click on the popover in the overlay view must not race the blur.
      setTimeout(() => {
        if (!lastFocus) report(null);
      }, 250);
    },
    true,
  );
  const submitted = (pw: HTMLElementLike): void => {
    const password = pw.value ?? '';
    if (!password) return;
    const user = usernameFor(pw);
    ipcRenderer.send(channel('credentials/submitted'), { username: user?.value ?? '', password });
  };
  document.addEventListener(
    'submit',
    (e) => {
      const form = (e as { target: HTMLElementLike | null }).target;
      const pw = form ? Array.from(form.querySelectorAll(PASSWORD_SEL))[0] : undefined;
      if (pw) submitted(pw);
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (e) => {
      const ev = e as KeyEvent & { target: HTMLElementLike | null };
      if (ev.key === 'Enter' && ev.target && isPasswordField(ev.target)) submitted(ev.target);
    },
    true,
  );
  document.addEventListener(
    'click',
    (e) => {
      const el = (e as { target: HTMLElementLike | null }).target;
      const btn = el?.closest('button, input[type="submit"]');
      const form = btn?.form ?? btn?.closest('form') ?? null;
      const pw = form ? Array.from(form.querySelectorAll(PASSWORD_SEL))[0] : undefined;
      if (pw && (btn?.type ?? 'submit').toLowerCase() !== 'button') submitted(pw);
    },
    true,
  );
  ipcRenderer.on(channel('credentials/fill'), (_e, creds: { username: string; password: string }) => {
    if (!document) return;
    const active = document.activeElement;
    const pw =
      (active && passwordFor(active)) ?? Array.from(document.querySelectorAll(PASSWORD_SEL))[0] ?? null;
    if (!pw) return;
    const user = usernameFor(pw);
    if (user && creds.username) setValue(user, creds.username);
    setValue(pw, creds.password);
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
