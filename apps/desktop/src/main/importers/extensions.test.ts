import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readChromiumExtensions } from './extensions';

const STORE = 'https://clients2.google.com/service/update2/crx';
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

function ext(
  userData: string,
  profile: string,
  id: string,
  version: string,
  manifest: object,
  files: Record<string, Buffer | string> = {},
): void {
  const dir = join(userData, profile, 'Extensions', id, version);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
}

describe('readChromiumExtensions', () => {
  it('lists Web Store extensions of every profile once, with their name and largest icon', () => {
    const ud = mkdtempSync(join(tmpdir(), 'vela-arc-ext-'));
    ext(
      ud,
      'Default',
      'aaaabbbbccccddddeeeeffffgggghhhh',
      '1.0_0',
      {
        name: 'Dark Reader',
        update_url: STORE,
        icons: { '16': 'icons/16.png', '128': 'icons/128.png', '48': 'icons/48.png' },
      },
      { 'icons/128.png': PNG, 'icons/16.png': PNG, 'icons/48.png': PNG },
    );
    ext(ud, 'Profile 3', 'aaaabbbbccccddddeeeeffffgggghhhh', '1.1_0', {
      name: 'Dark Reader',
      update_url: STORE,
    });
    ext(ud, 'Profile 3', 'iiiijjjjkkkkllllmmmmnnnnoooopppp', '2.0_0', { name: 'Vimium', update_url: STORE });

    const list = readChromiumExtensions(ud, ['Default', 'Profile 3']);
    expect(list.map((e) => e.name)).toEqual(['Dark Reader', 'Vimium']);
    expect(list[0]?.icon).toBe(`data:image/png;base64,${PNG.toString('base64')}`);
    expect(list[1]?.icon).toBeNull();
  });

  it('resolves localised names from the default locale', () => {
    const ud = mkdtempSync(join(tmpdir(), 'vela-arc-ext-'));
    ext(
      ud,
      'Default',
      'qqqqrrrrssssttttuuuuvvvvwwwwxxxx',
      '3.0_0',
      {
        name: '__MSG_appName__',
        default_locale: 'en',
        update_url: STORE,
      },
      { '_locales/en/messages.json': JSON.stringify({ appname: { message: 'Google Translate' } }) },
    );
    expect(readChromiumExtensions(ud, ['Default'])[0]?.name).toBe('Google Translate');
  });

  it('skips built-ins, themes, apps, unreadable manifests and missing profiles', () => {
    const ud = mkdtempSync(join(tmpdir(), 'vela-arc-ext-'));
    ext(ud, 'Default', 'builtinbuiltinbuiltinbuiltinbuil', '1_0', { name: 'Arc internals' });
    ext(ud, 'Default', 'themethemethemethemethemethemethe', '1_0', {
      name: 'Theme',
      update_url: STORE,
      theme: {},
    });
    ext(ud, 'Default', 'appappappappappappappappappappapp', '1_0', {
      name: 'App',
      update_url: STORE,
      app: {},
    });
    mkdirSync(join(ud, 'Default', 'Extensions', 'brokenbrokenbrokenbrokenbrokenbr', '1_0'), {
      recursive: true,
    });
    writeFileSync(
      join(ud, 'Default', 'Extensions', 'brokenbrokenbrokenbrokenbrokenbr', '1_0', 'manifest.json'),
      '{',
    );
    expect(readChromiumExtensions(ud, ['Default', 'Profile 9'])).toEqual([]);
  });
});
