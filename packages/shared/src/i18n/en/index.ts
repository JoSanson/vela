import { common } from './common';
import { menu } from './menu';
import { overlay } from './overlay';
import { pages } from './pages';
import { settings } from './settings';
import { shell } from './shell';

export const en = { ...common, ...shell, ...overlay, ...pages, ...settings, ...menu } as const;
