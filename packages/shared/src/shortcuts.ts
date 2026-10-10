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
  { id: 'readerMode', label: 'Reader mode', accelerator: 'CmdOrCtrl+Alt+R', group: 'page', reserved: false },
  {
    id: 'toggleSidebar',
    label: 'Toggle sidebar',
    accelerator: 'CmdOrCtrl+S',
    group: 'view',
    reserved: false,
  },
  {
    id: 'splitView',
    label: 'Add split view',
    accelerator: 'CmdOrCtrl+Shift+D',
    group: 'view',
    reserved: true,
  },
  {
    id: 'closeSplit',
    label: 'Close split pane',
    accelerator: 'CmdOrCtrl+Shift+W',
    group: 'view',
    reserved: true,
  },
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
  { id: 'newSpace', label: 'New space', accelerator: 'CmdOrCtrl+Shift+N', group: 'spaces', reserved: true },
  {
    id: 'archiveView',
    label: 'Archived tabs',
    accelerator: 'CmdOrCtrl+Shift+A',
    group: 'spaces',
    reserved: true,
  },
  { id: 'downloads', label: 'Downloads', accelerator: 'CmdOrCtrl+Shift+J', group: 'window', reserved: true },
  { id: 'history', label: 'History', accelerator: 'CmdOrCtrl+Y', group: 'window', reserved: true },
  { id: 'settings', label: 'Settings', accelerator: 'CmdOrCtrl+,', group: 'window', reserved: true },
  { id: 'newWindow', label: 'New window', accelerator: 'CmdOrCtrl+N', group: 'window', reserved: true },
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

export const UNRESERVED_SHORTCUTS: ShortcutDef[] = [...SHORTCUTS, ...SPACE_SHORTCUTS].filter(
  (s) => !s.reserved,
);

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
