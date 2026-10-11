import { resolveShortcuts, SPACE_SHORTCUTS } from '@vela/shared';
import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { runCommand } from './commands';
import type { AppContext } from './context';

export function installMenu(ctx: AppContext): void {
  const isMac = process.platform === 'darwin';
  const defs = resolveShortcuts(ctx.prefs.value.shortcutOverrides);
  const item = (
    id: string,
    overrides: Partial<MenuItemConstructorOptions> = {},
  ): MenuItemConstructorOptions => {
    const def = defs.find((s) => s.id === id);
    return {
      label: def?.label ?? id,
      ...(def?.reserved ? { accelerator: def.accelerator } : {}),
      click: () => runCommand(ctx, id),
      ...overrides,
    };
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              item('settings', { label: 'Settings…' }),
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        item('newTab'),
        item('littleWindow'),
        item('openFile', { label: 'Open File…' }),
        { type: 'separator' },
        item('closeTab'),
        item('reopenTab'),
        { type: 'separator' },
        item('pinTab'),
        item('archiveView'),
        { type: 'separator' },
        item('savePage', { label: 'Save Page As…' }),
        item('print', { label: 'Print…' }),
        { type: 'separator' },
        ...(isMac ? [] : [item('settings', { label: 'Settings…' }), { role: 'quit' as const }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        item('findInPage'),
      ],
    },
    {
      label: 'View',
      submenu: [
        item('editUrl'),
        item('reload'),
        item('hardReload'),
        { type: 'separator' },
        item('toggleSidebar'),
        item('splitView'),
        item('closeSplit'),
        item('readerMode'),
        { type: 'separator' },
        item('zoomIn'),
        item('zoomOut'),
        item('zoomReset'),
        { type: 'separator' },
        item('fullscreen'),
        item('devtools'),
        item('viewSource'),
      ],
    },
    {
      label: 'History',
      submenu: [item('back'), item('forward'), { type: 'separator' }, item('history')],
    },
    {
      label: 'Spaces',
      submenu: [
        item('newSpace'),
        item('spaceNext'),
        item('spacePrev'),
        { type: 'separator' },
        ...SPACE_SHORTCUTS.map((s) => ({
          label: s.label,
          click: () => runCommand(ctx, s.id),
        })),
      ],
    },
    {
      label: 'Tabs',
      submenu: [
        item('nextTabMru'),
        item('prevTabMru'),
        item('nextTab'),
        item('prevTab'),
        { type: 'separator' },
        item('downloads'),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : [{ role: 'close' as const }]),
      ],
    },
    {
      role: 'help',
      submenu: [
        item('shortcuts', { label: 'Keyboard shortcuts' }),
        { label: 'Vela on GitHub', click: () => void shell.openExternal('https://github.com/JoSanson/vela') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
