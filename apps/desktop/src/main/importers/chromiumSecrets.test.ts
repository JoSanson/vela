import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  chromiumKey,
  cookieRowToSet,
  decryptChromium,
  encryptChromium,
  loginsToCredentials,
  profileNamesFromLocalState,
  stripCookieHash,
} from './chromiumSecrets';

const key = chromiumKey('unit-test-password', 1003);
const chromeTime = (ms: number): number => (ms + 11644473600000) * 1000;

describe('Chromium secrets', () => {
  it('round-trips v10 values and leaves plaintext alone', () => {
    const enc = encryptChromium(Buffer.from('s3cret'), key);
    expect(enc.subarray(0, 3).toString()).toBe('v10');
    expect(decryptChromium(enc, key)?.toString()).toBe('s3cret');
    expect(decryptChromium(Buffer.from('plain'), key)?.toString()).toBe('plain');
    expect(decryptChromium(enc, chromiumKey('wrong', 1003))).toBeNull();
  });

  it('strips the host hash newer Chromium prepends to cookies', () => {
    const hash = createHash('sha256').update('.example.com').digest();
    expect(stripCookieHash(Buffer.concat([hash, Buffer.from('v')]), '.example.com').toString()).toBe('v');
    expect(stripCookieHash(Buffer.from('short'), '.example.com').toString()).toBe('short');
  });

  it('turns login rows into credentials, dropping duplicates and non-web origins', () => {
    const rows = [
      {
        origin_url: 'https://app.example.com/login?next=/',
        username_value: 'jo',
        password_value: encryptChromium(Buffer.from('pw1'), key),
        date_last_used: chromeTime(1_700_000_000_000),
        date_password_modified: chromeTime(1_600_000_000_000),
      },
      {
        origin_url: 'https://app.example.com/other',
        username_value: 'jo',
        password_value: encryptChromium(Buffer.from('pw-dup'), key),
        date_last_used: null,
        date_password_modified: null,
      },
      {
        origin_url: 'chrome://settings',
        username_value: 'x',
        password_value: encryptChromium(Buffer.from('pw'), key),
        date_last_used: null,
        date_password_modified: null,
      },
      {
        origin_url: 'https://b.example.com/',
        username_value: '',
        password_value: null,
        date_last_used: null,
        date_password_modified: null,
      },
    ];
    const creds = loginsToCredentials(rows, key, 42);
    expect(creds).toEqual([
      {
        origin: 'https://app.example.com',
        username: 'jo',
        password: 'pw1',
        updatedAt: 1_600_000_000_000,
        lastUsedAt: 1_700_000_000_000,
      },
    ]);
  });

  it('maps cookie rows to Electron cookies and skips expired ones', () => {
    const now = 1_700_000_000_000;
    const hash = createHash('sha256').update('.example.com').digest();
    const row = {
      host_key: '.example.com',
      name: 'sid',
      value: '',
      encrypted_value: encryptChromium(Buffer.concat([hash, Buffer.from('abc')]), key),
      path: '/',
      expires_utc: chromeTime(now + 1000),
      is_secure: 1,
      is_httponly: 1,
      samesite: 1,
      has_expires: 1,
    };
    expect(cookieRowToSet(row, key, now)).toEqual({
      url: 'https://example.com/',
      name: 'sid',
      value: 'abc',
      domain: '.example.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      expirationDate: Math.floor((now + 1000) / 1000),
    });
    expect(cookieRowToSet({ ...row, expires_utc: chromeTime(now - 1) }, key, now)).toBeNull();
    expect(cookieRowToSet({ ...row, has_expires: 0, samesite: -1, is_secure: 0 }, key, now)).toMatchObject({
      url: 'http://example.com/',
      sameSite: 'unspecified',
    });
    // Host-only cookies (no leading dot) must not become domain cookies: `__Host-` ones would be refused.
    const hostOnly = cookieRowToSet(
      { ...row, host_key: 'accounts.example.com', name: '__Host-GAPS', encrypted_value: null, value: 'x' },
      key,
      now,
    );
    expect(hostOnly).toMatchObject({ url: 'https://accounts.example.com/', name: '__Host-GAPS', value: 'x' });
    expect(hostOnly).not.toHaveProperty('domain');
  });

  it('reads profile display names from Local State', () => {
    expect(
      profileNamesFromLocalState({
        profile: { info_cache: { Default: { name: 'Jordane' }, 'Profile 3': { name: ' Work ' }, X: {} } },
      }),
    ).toEqual({ Default: 'Jordane', 'Profile 3': 'Work' });
    expect(profileNamesFromLocalState(null)).toEqual({});
  });
});
