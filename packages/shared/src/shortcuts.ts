export interface ShortcutDef {
  id: string;
  label: string;
  /** Electron accelerator; `CmdOrCtrl` resolves per platform. */
  accelerator: string;
  group: 'tabs' | 'navigation' | 'spaces' | 'view' | 'window' | 'page';
  /**
   * Reserved shortcuts are menu accelerators and always reach Vela. Unreserved ones are delivered
   * to the page first (like Chrome): Vela only acts when the page did not call preventDefault().
   */
  reserved: boolean;
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  { id: 'newTab', label: 'New tab / command bar', accelerator: 'CmdOrCtrl+T', group: 'tabs', reserved: true },
  { id: 'editUrl', label: 'Edit current URL', accelerator: 'CmdOrCtrl+L', group: 'tabs', reserved: true },
  { id: 'closeTab', label: 'Close tab', accelerator: 'CmdOrCtrl+W', group: 'tabs', reserved: true },
  {
    id: 'reopenTab',
    label: 'Reopen closed tab',
    accelerator: 'CmdOrCtrl+Shift+T',
    group: 'tabs',
    reserved: true,
  },
  { id: 'pinTab', label: 'Pin / unpin tab', accelerator: 'CmdOrCtrl+D', group: 'tabs', reserved: false },
  {
    id: 'copyUrl',
    label: 'Copy current URL',
    accelerator: 'CmdOrCtrl+Shift+C',
    group: 'tabs',
    reserved: true,
  },
  {
    id: 'copyUrlMarkdown',
    label: 'Copy current URL as Markdown',
    accelerator: 'CmdOrCtrl+Shift+Alt+C',
    group: 'tabs',
    reserved: true,
  },
  {
    id: 'clearToday',
    label: 'Clear unpinned tabs',
    accelerator: 'CmdOrCtrl+Shift+K',
    group: 'tabs',
    reserved: true,
  },
  { id: 'nextTabMru', label: 'Switch to recent tab', accelerator: 'Ctrl+Tab', group: 'tabs', reserved: true },
  {
    id: 'prevTabMru',
    label: 'Switch back (reverse)',
    accelerator: 'Ctrl+Shift+Tab',
    group: 'tabs',
    reserved: true,
  },
  {
    id: 'nextTab',
    label: 'Next tab in list',
    accelerator: 'CmdOrCtrl+Alt+Down',
    group: 'tabs',
    reserved: false,
  },
  {
    id: 'prevTab',
    label: 'Previous tab in list',
    accelerator: 'CmdOrCtrl+Alt+Up',
    group: 'tabs',
    reserved: false,
  },
  { id: 'reload', label: 'Reload', accelerator: 'CmdOrCtrl+R', group: 'navigation', reserved: true },
  { id: 'stop', label: 'Stop loading', accelerator: 'CmdOrCtrl+.', group: 'navigation', reserved: true },
  {
    id: 'hardReload',
    label: 'Hard reload',
    accelerator: 'CmdOrCtrl+Shift+R',
    group: 'navigation',
    reserved: true,
  },
  { id: 'back', label: 'Back', accelerator: 'CmdOrCtrl+[', group: 'navigation', reserved: false },
  { id: 'forward', label: 'Forward', accelerator: 'CmdOrCtrl+]', group: 'navigation', reserved: false },
  { id: 'findInPage', label: 'Find in page', accelerator: 'CmdOrCtrl+F', group: 'page', reserved: false },
  { id: 'zoomIn', label: 'Zoom in', accelerator: 'CmdOrCtrl+=', group: 'page', reserved: false },
  { id: 'zoomOut', label: 'Zoom out', accelerator: 'CmdOrCtrl+-', group: 'page', reserved: false },
  { id: 'zoomReset', label: 'Reset zoom', accelerator: 'CmdOrCtrl+0', group: 'page', reserved: false },
  { id: 'devtools', label: 'Developer tools', accelerator: 'CmdOrCtrl+Alt+I', group: 'page', reserved: true },
  {
    id: 'viewSource',
    label: 'View page source',
    accelerator: 'CmdOrCtrl+Alt+U',
    group: 'page',
    reserved: true,
  },
  { id: 'print', label: 'Print page', accelerator: 'CmdOrCtrl+P', group: 'page', reserved: true },
  { id: 'readerMode', label: 'Reader mode', accelerator: 'CmdOrCtrl+Alt+R', group: 'page', reserved: false },
  {
    id: 'toggleSidebar',
    label: 'Toggle sidebar',
    accelerator: 'CmdOrCtrl+S',
    group: 'view',
    reserved: false,
  },
  { id: 'splitView', label: 'Add split view', accelerator: 'Ctrl+Shift+=', group: 'view', reserved: true },
  { id: 'closeSplit', label: 'Close split pane', accelerator: 'Ctrl+Shift+-', group: 'view', reserved: true },
  {
    id: 'fullscreen',
    label: 'Toggle full screen',
    accelerator: 'Ctrl+CmdOrCtrl+F',
    group: 'view',
    reserved: true,
  },
  {
    id: 'spaceNext',
    label: 'Next space',
    accelerator: 'CmdOrCtrl+Alt+Right',
    group: 'spaces',
    reserved: false,
  },
  {
    id: 'spacePrev',
    label: 'Previous space',
    accelerator: 'CmdOrCtrl+Alt+Left',
    group: 'spaces',
    reserved: false,
  },
  { id: 'newSpace', label: 'New space', accelerator: 'Ctrl+CmdOrCtrl+N', group: 'spaces', reserved: true },
  { id: 'allSpaces', label: 'All spaces', accelerator: 'CmdOrCtrl+Shift+S', group: 'spaces', reserved: true },
  {
    id: 'archiveView',
    label: 'Archived tabs',
    accelerator: 'CmdOrCtrl+Shift+L',
    group: 'spaces',
    reserved: true,
  },
  { id: 'downloads', label: 'Downloads', accelerator: 'CmdOrCtrl+Shift+J', group: 'window', reserved: true },
  { id: 'history', label: 'History', accelerator: 'CmdOrCtrl+Y', group: 'window', reserved: true },
  { id: 'settings', label: 'Settings', accelerator: 'CmdOrCtrl+,', group: 'window', reserved: true },
  { id: 'newWindow', label: 'New window', accelerator: 'CmdOrCtrl+N', group: 'window', reserved: true },
  {
    id: 'newPrivateWindow',
    label: 'New private window',
    accelerator: 'CmdOrCtrl+Shift+N',
    group: 'window',
    reserved: true,
  },
  { id: 'openFile', label: 'Open file', accelerator: 'CmdOrCtrl+O', group: 'window', reserved: true },
  {
    id: 'littleWindow',
    label: 'New Little Vela window',
    accelerator: 'CmdOrCtrl+Alt+N',
    group: 'window',
    reserved: true,
  },
];

export const SPACE_SHORTCUTS: ShortcutDef[] = Array.from({ length: 9 }, (_, i) => ({
  id: `space${i + 1}`,
  label: `Go to space ${i + 1}`,
  accelerator: `Ctrl+${i + 1}`,
  group: 'spaces',
  reserved: false,
}));

/** ⌘1…9 jump to the Nth tab of the sidebar (pinned in tree order, then Today), as in Arc. */
export const TAB_SHORTCUTS: ShortcutDef[] = Array.from({ length: 9 }, (_, i) => ({
  id: `tab${i + 1}`,
  label: `Go to tab ${i + 1}`,
  accelerator: `CmdOrCtrl+${i + 1}`,
  group: 'tabs',
  reserved: true,
}));

/** ⌃⇧1…4 focus the Nth split pane. */
export const SPLIT_SHORTCUTS: ShortcutDef[] = Array.from({ length: 4 }, (_, i) => ({
  id: `split${i + 1}`,
  label: `Focus split pane ${i + 1}`,
  accelerator: `Ctrl+Shift+${i + 1}`,
  group: 'view',
  reserved: true,
}));

export const UNRESERVED_SHORTCUTS: ShortcutDef[] = [
  ...SHORTCUTS,
  ...SPACE_SHORTCUTS,
  ...TAB_SHORTCUTS,
  ...SPLIT_SHORTCUTS,
].filter((s) => !s.reserved);

export interface KeyLike {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const KEY_ALIASES: Record<string, string[]> = {
  up: ['arrowup'],
  down: ['arrowdown'],
  left: ['arrowleft'],
  right: ['arrowright'],
  '=': ['=', '+'],
  '-': ['-', '_'],
  tab: ['tab'],
};

/** True when a DOM keyboard event matches an Electron accelerator on the given platform. */
export function matchesAccelerator(e: KeyLike, accelerator: string, platform: string): boolean {
  const parts = accelerator.split('+');
  const key = (parts.pop() ?? '').toLowerCase();
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  const isMac = platform === 'darwin';
  const wantCmdOrCtrl = mods.has('cmdorctrl') || mods.has('commandorcontrol');
  const wantCtrl = mods.has('ctrl') || mods.has('control') || (!isMac && wantCmdOrCtrl);
  const wantMeta = mods.has('cmd') || mods.has('command') || mods.has('super') || (isMac && wantCmdOrCtrl);
  const wantAlt = mods.has('alt') || mods.has('option');
  const wantShift = mods.has('shift');
  if (e.ctrlKey !== wantCtrl || e.metaKey !== wantMeta || e.altKey !== wantAlt || e.shiftKey !== wantShift)
    return false;
  const pressed = e.key.toLowerCase();
  const accepted = KEY_ALIASES[key] ?? [key];
  if (accepted.includes(pressed)) return true;
  // Digits: Alt/Option changes `key` on macOS, so fall back to the physical code.
  if (/^[0-9]$/.test(key) && e.code === `Digit${key}`) return true;
  if (/^[a-z]$/.test(key) && e.code === `Key${key.toUpperCase()}`) return true;
  return false;
}

export function shortcutForEvent(
  e: KeyLike,
  platform: string,
  defs: readonly ShortcutDef[] = UNRESERVED_SHORTCUTS,
): string | null {
  for (const d of defs) if (matchesAccelerator(e, d.accelerator, platform)) return d.id;
  return null;
}

/** User overrides: shortcut id → accelerator (prefs.shortcutOverrides). */
export type ShortcutOverrides = Record<string, string>;

export const ALL_SHORTCUTS: readonly ShortcutDef[] = [
  ...SHORTCUTS,
  ...SPACE_SHORTCUTS,
  ...TAB_SHORTCUTS,
  ...SPLIT_SHORTCUTS,
];

/** Every shortcut with the user's accelerators applied; ids and reserved flags never change. */
export function resolveShortcuts(overrides: ShortcutOverrides = {}): ShortcutDef[] {
  return ALL_SHORTCUTS.map((d) => {
    const acc = overrides[d.id];
    return acc && acc !== d.accelerator ? { ...d, accelerator: acc } : d;
  });
}

export function unreservedOf(defs: readonly ShortcutDef[]): ShortcutDef[] {
  return defs.filter((d) => !d.reserved);
}

/** Another shortcut already using `accelerator` (case-insensitive), if any. */
export function findConflict(
  accelerator: string,
  defs: readonly ShortcutDef[],
  exceptId?: string,
): ShortcutDef | undefined {
  const a = accelerator.toLowerCase();
  return defs.find((d) => d.id !== exceptId && d.accelerator.toLowerCase() === a);
}

const KEY_NAMES: Record<string, string> = {
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  tab: 'Tab',
  enter: 'Enter',
  escape: 'Escape',
  backspace: 'Backspace',
  delete: 'Delete',
  ' ': 'Space',
  '+': '=',
};

/** Turns a keydown into an Electron accelerator (`CmdOrCtrl+Shift+K`), or null for bare modifiers. */
export function acceleratorFromEvent(e: KeyLike, platform: string): string | null {
  const key = e.key.toLowerCase();
  if (['meta', 'control', 'alt', 'shift', 'dead', 'unidentified'].includes(key)) return null;
  const isMac = platform === 'darwin';
  const mods: string[] = [];
  const primary = isMac ? e.metaKey : e.ctrlKey;
  if (primary) mods.push('CmdOrCtrl');
  if (isMac && e.ctrlKey) mods.push('Ctrl');
  if (!isMac && e.metaKey) mods.push('Super');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  let name = KEY_NAMES[key];
  if (!name) {
    const code = e.code ?? '';
    if (/^Key[A-Z]$/.test(code)) name = code.slice(3);
    else if (/^Digit[0-9]$/.test(code)) name = code.slice(5);
    else if (key.length === 1) name = key.toUpperCase();
    else return null;
  }
  // Plain letters/digits without a modifier would hijack typing: require at least one.
  if (mods.length === 0 && /^[A-Z0-9=[\],.-]$/.test(name)) return null;
  return [...mods, name].join('+');
}
