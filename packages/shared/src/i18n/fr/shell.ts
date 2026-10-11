import type { shell as en } from '../en/shell';

export const shell = {} satisfies Record<keyof typeof en, string>;
