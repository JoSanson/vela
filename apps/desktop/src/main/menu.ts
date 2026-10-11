import { resolveShortcuts, shortcutLabel, SPACE_SHORTCUTS } from '@vela/shared';
import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { runCommand } from './commands';
import type { AppContext } from './context';

export function installMenu(ctx: AppContext): void {
  const isMac = process.platform === 'darwin';
  const t = ctx.i18n.t;
  const defs = resolveShortcuts(ctx.prefs.value.shortcutOverrides);
  const item = (
    id: string,
    overrides: Partial<MenuItemConstructorOptions> = {},
  ): MenuItemConstructorOptions => {
    const def = defs.find((s) => s.id === id);
    return {
      label: def ? shortcutLabel(t, def) : id,
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
              item('settings', { label: t('menu.app.settings') }),
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
      label: t('menu.file.label'),
      submenu: [
        item('newTab'),
        item('littleWindow'),
        item('openFile', { label: t('menu.file.openFile') }),
        { type: 'separator' },
        item('closeTab'),
        item('reopenTab'),
        { type: 'separator' },
        item('pinTab'),
        item('archiveView'),
        { type: 'separator' },
        item('savePage', { label: t('menu.file.savePageAs') }),
        item('print', { label: t('menu.file.print') }),
        { type: 'separator' },
        ...(isMac ? [] : [item('settings', { label: t('menu.app.settings') }), { role: 'quit' as const }]),
      ],
    },
    {
      label: t('menu.edit.label'),
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
      label: t('menu.view.label'),
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
      label: t('menu.history.label'),
      submenu: [item('back'), item('forward'), { type: 'separator' }, item('history')],
    },
    {
      label: t('menu.spaces.label'),
      submenu: [
        item('newSpace'),
        item('allSpaces'),
        item('spaceNext'),
        item('spacePrev'),
        { type: 'separator' },
        ...SPACE_SHORTCUTS.map((s) => ({
          label: shortcutLabel(t, s),
          click: () => runCommand(ctx, s.id),
        })),
      ],
    },
    {
      label: t('menu.tabs.label'),
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
      label: t('menu.window.label'),
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
        item('shortcuts', { label: t('menu.help.shortcuts') }),
        {
          label: t('menu.help.github'),
          click: () => void shell.openExternal('https://github.com/JoSanson/vela'),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
