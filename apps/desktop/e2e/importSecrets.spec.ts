import Database from 'better-sqlite3';
import { createCipheriv, createHash, pbkdf2Sync } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, launchVela, test } from './helpers';

const PASSWORD = 'e2e-safe-storage';
// Chromium derives the OS-crypt key with 1 PBKDF2 iteration on Linux and 1003 elsewhere.
const key = pbkdf2Sync(PASSWORD, 'saltysalt', process.platform === 'linux' ? 1 : 1003, 16, 'sha1');
const encrypt = (plain: Buffer): Buffer => {
  const c = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20));
  return Buffer.concat([Buffer.from('v10'), c.update(plain), c.final()]);
};
const chromeTime = (ms: number): number => (ms + 11644473600000) * 1000;

function writeProfile(
  dir: string,
  host: string,
  cookieValue: string,
  login: { url: string; user: string; pw: string },
) {
  mkdirSync(dir, { recursive: true });
  const logins = new Database(join(dir, 'Login Data'));
  logins.exec(
    'CREATE TABLE logins (origin_url TEXT, username_value TEXT, password_value BLOB, date_last_used INTEGER, date_password_modified INTEGER, blacklisted_by_user INTEGER DEFAULT 0)',
  );
  logins
    .prepare('INSERT INTO logins VALUES (?, ?, ?, ?, ?, 0)')
    .run(
      login.url,
      login.user,
      encrypt(Buffer.from(login.pw)),
      chromeTime(Date.now()),
      chromeTime(Date.now()),
    );
  logins.close();
  const cookies = new Database(join(dir, 'Cookies'));
  cookies.exec(
    'CREATE TABLE cookies (host_key TEXT, name TEXT, value TEXT, encrypted_value BLOB, path TEXT, expires_utc INTEGER, is_secure INTEGER, is_httponly INTEGER, samesite INTEGER, has_expires INTEGER)',
  );
  const hash = createHash('sha256').update(host).digest();
  cookies
    .prepare('INSERT INTO cookies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      host,
      'session',
      '',
      encrypt(Buffer.concat([hash, Buffer.from(cookieValue)])),
      '/',
      chromeTime(Date.now() + 86_400_000),
      0,
      1,
      1,
      1,
    );
  cookies
    .prepare('INSERT INTO cookies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      host,
      'stale',
      '',
      encrypt(Buffer.concat([hash, Buffer.from('old')])),
      '/',
      chromeTime(Date.now() - 1000),
      0,
      0,
      -1,
      1,
    );
  cookies.close();
}

test('imports Arc passwords and cookies into the matching profiles', async ({ fixtures }) => {
  const root = mkdtempSync(join(tmpdir(), 'vela-secrets-'));
  const userData = join(root, 'arc', 'User Data');
  writeProfile(join(userData, 'Default'), '127.0.0.1', 'main-session', {
    url: 'http://127.0.0.1:1/login',
    user: 'jo',
    pw: 'hunter2',
  });
  writeProfile(join(userData, 'Profile 1'), 'localhost', 'work-session', {
    url: 'http://localhost:1/signin',
    user: 'work',
    pw: 'w0rk',
  });
  writeFileSync(
    join(userData, 'Local State'),
    JSON.stringify({
      profile: { info_cache: { Default: { name: 'Jordane' }, 'Profile 1': { name: 'Work' } } },
    }),
  );
  const space = (id: string, title: string, profile: unknown) => [
    id,
    { id, title, containerIDs: ['unpinned', `${id}-u`, 'pinned', `${id}-p`], customInfo: {}, profile },
  ];
  const container = (id: string, spaceId: string) => [
    id,
    {
      id,
      parentID: null,
      childrenIds: [],
      data: { itemContainer: { containerType: { spaceItems: { _0: spaceId } } } },
    },
  ];
  writeFileSync(
    join(root, 'arc', 'StorableSidebar.json'),
    JSON.stringify({
      version: 1,
      sidebar: {
        containers: [
          { global: {} },
          {
            spaces: [
              ...space('s-home', 'Perso', { default: true }),
              ...space('s-work', 'Work', {
                custom: { _0: { directoryBasename: 'Profile 1', machineID: 'm' } },
              }),
            ],
            items: [
              ...container('s-home-u', 's-home'),
              ...container('s-home-p', 's-home'),
              ...container('s-work-u', 's-work'),
              ...container('s-work-p', 's-work'),
            ],
            topAppsContainerIDs: [],
          },
        ],
      },
    }),
  );
  const vela = await launchVela({ fixtures, env: { VELA_IMPORT_ROOT: root, VELA_IMPORT_KEY: PASSWORD } });
  try {
    const sources = await vela.app.evaluate(() => {
      const g = globalThis as unknown as {
        __vela: { importer: { detectSources: () => { id: string; passwords: boolean; cookies: boolean }[] } };
      };
      return g.__vela.importer.detectSources();
    });
    expect(sources.find((s) => s.id === 'arc')).toMatchObject({ passwords: true, cookies: true });
    const result = await vela.app.evaluate(() => {
      const g = globalThis as unknown as {
        __vela: {
          importer: {
            runImport: (
              s: string,
              b: boolean,
              h: boolean,
              st: boolean,
              pw: boolean,
              ck: boolean,
            ) => Promise<unknown>;
          };
        };
      };
      return g.__vela.importer.runImport('arc', true, true, true, true, true);
    });
    expect(result).toMatchObject({ spaces: 2, profiles: 1, passwords: 2, cookies: 2 });

    const st = await vela.state();
    const work = Object.values(st.profiles).find((p) => p.name === 'Work');
    expect(work).toBeTruthy();
    expect(Object.values(st.spaces).find((s) => s.name === 'Work')?.profileId).toBe(work?.id);

    const creds = await vela.app.evaluate(() => {
      const g = globalThis as unknown as {
        __vela: {
          ctx: {
            credentials: {
              list: () => { origin: string; username: string }[];
              reveal: (id: string) => string | null;
            };
          };
        };
      };
      const list = g.__vela.ctx.credentials.list() as { id: string; origin: string; username: string }[];
      return list.map((c) => ({
        origin: c.origin,
        username: c.username,
        password: g.__vela.ctx.credentials.reveal(c.id),
      }));
    });
    expect(creds).toEqual(
      expect.arrayContaining([
        { origin: 'http://127.0.0.1:1', username: 'jo', password: 'hunter2' },
        { origin: 'http://localhost:1', username: 'work', password: 'w0rk' },
      ]),
    );

    const cookies = await vela.app.evaluate(async ({ session }, partition) => {
      const main = await session.fromPartition('persist:default').cookies.get({});
      const work = await session.fromPartition(partition).cookies.get({});
      return {
        main: main.map((c) => `${c.domain} ${c.name}=${c.value}`),
        work: work.map((c) => `${c.domain} ${c.name}=${c.value}`),
      };
    }, work?.partition ?? '');
    expect(cookies.main).toEqual(['127.0.0.1 session=main-session']);
    expect(cookies.work).toEqual(['localhost session=work-session']);
  } finally {
    await vela.close();
    rmSync(root, { recursive: true, force: true });
  }
});
