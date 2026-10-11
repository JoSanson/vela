import type { settings as en } from '../en/settings';

export const settings = {
  'settings.language.label': 'Langue',
  'settings.language.hint': 'Menus, réglages et pages internes. Les sites web gardent leur langue.',
  'settings.language.system': 'Système ({name})',
} satisfies Record<keyof typeof en, string>;
