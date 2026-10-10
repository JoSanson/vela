export interface ShortcutDef {
  id: string;
  label: string;
  /** Electron accelerator; `CmdOrCtrl` resolves per platform. */
  accelerator: string;
  group: 'tabs' | 'navigation' | 'spaces' | 'view' | 'window' | 'page';
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  { id: 'newTab', label: 'New tab / command bar', accelerator: 'CmdOrCtrl+T', group: 'tabs' },
  { id: 'editUrl', label: 'Edit current URL', accelerator: 'CmdOrCtrl+L', group: 'tabs' },
  { id: 'closeTab', label: 'Close tab', accelerator: 'CmdOrCtrl+W', group: 'tabs' },
  { id: 'reopenTab', label: 'Reopen closed tab', accelerator: 'CmdOrCtrl+Shift+T', group: 'tabs' },
  { id: 'pinTab', label: 'Pin / unpin tab', accelerator: 'CmdOrCtrl+D', group: 'tabs' },
  { id: 'nextTabMru', label: 'Switch to recent tab', accelerator: 'Ctrl+Tab', group: 'tabs' },
  { id: 'prevTabMru', label: 'Switch back (reverse)', accelerator: 'Ctrl+Shift+Tab', group: 'tabs' },
  { id: 'nextTab', label: 'Next tab in list', accelerator: 'CmdOrCtrl+Alt+Down', group: 'tabs' },
  { id: 'prevTab', label: 'Previous tab in list', accelerator: 'CmdOrCtrl+Alt+Up', group: 'tabs' },
  { id: 'reload', label: 'Reload', accelerator: 'CmdOrCtrl+R', group: 'navigation' },
  { id: 'hardReload', label: 'Hard reload', accelerator: 'CmdOrCtrl+Shift+R', group: 'navigation' },
  { id: 'back', label: 'Back', accelerator: 'CmdOrCtrl+[', group: 'navigation' },
  { id: 'forward', label: 'Forward', accelerator: 'CmdOrCtrl+]', group: 'navigation' },
  { id: 'findInPage', label: 'Find in page', accelerator: 'CmdOrCtrl+F', group: 'page' },
  { id: 'zoomIn', label: 'Zoom in', accelerator: 'CmdOrCtrl+=', group: 'page' },
  { id: 'zoomOut', label: 'Zoom out', accelerator: 'CmdOrCtrl+-', group: 'page' },
  { id: 'zoomReset', label: 'Reset zoom', accelerator: 'CmdOrCtrl+0', group: 'page' },
  { id: 'devtools', label: 'Developer tools', accelerator: 'CmdOrCtrl+Alt+I', group: 'page' },
  { id: 'readerMode', label: 'Reader mode', accelerator: 'CmdOrCtrl+Shift+R', group: 'page' },
  { id: 'toggleSidebar', label: 'Toggle sidebar', accelerator: 'CmdOrCtrl+S', group: 'view' },
  { id: 'splitView', label: 'Add split view', accelerator: 'CmdOrCtrl+Shift+D', group: 'view' },
  { id: 'closeSplit', label: 'Close split pane', accelerator: 'CmdOrCtrl+Shift+W', group: 'view' },
  { id: 'fullscreen', label: 'Toggle full screen', accelerator: 'Ctrl+CmdOrCtrl+F', group: 'view' },
  { id: 'spaceNext', label: 'Next space', accelerator: 'CmdOrCtrl+Alt+Right', group: 'spaces' },
  { id: 'spacePrev', label: 'Previous space', accelerator: 'CmdOrCtrl+Alt+Left', group: 'spaces' },
  { id: 'newSpace', label: 'New space', accelerator: 'CmdOrCtrl+Shift+N', group: 'spaces' },
  { id: 'archiveView', label: 'Archived tabs', accelerator: 'CmdOrCtrl+Shift+A', group: 'spaces' },
  { id: 'downloads', label: 'Downloads', accelerator: 'CmdOrCtrl+Shift+J', group: 'window' },
  { id: 'history', label: 'History', accelerator: 'CmdOrCtrl+Y', group: 'window' },
  { id: 'settings', label: 'Settings', accelerator: 'CmdOrCtrl+,', group: 'window' },
  { id: 'newWindow', label: 'New window', accelerator: 'CmdOrCtrl+N', group: 'window' },
  { id: 'littleWindow', label: 'New Little Vela window', accelerator: 'CmdOrCtrl+Alt+N', group: 'window' },
];

export const SPACE_SHORTCUTS = Array.from({ length: 9 }, (_, i) => ({
  id: `space${i + 1}`,
  label: `Go to space ${i + 1}`,
  accelerator: `Ctrl+${i + 1}`,
}));
