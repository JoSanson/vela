import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync } from 'node:crypto';
import { chromeTimeToMs } from './chromium';

/**
 * Chromium "OS crypt" as used by Arc, Chrome, Brave and Edge: values prefixed `v10` are
 * AES-128-CBC with a key derived (PBKDF2-SHA1, salt `saltysalt`) from a random password the
 * browser keeps in the OS keychain ("Arc Safe Storage"). macOS uses 1003 iterations, Linux 1
 * with the fixed password `peanuts` when no keyring is used. Windows wraps the key with DPAPI
 * instead and is not supported here.
 */
export const SAFE_STORAGE: Record<'arc' | 'chrome' | 'brave' | 'edge', { service: string; account: string }> =
  {
    arc: { service: 'Arc Safe Storage', account: 'Arc' },
    chrome: { service: 'Chrome Safe Storage', account: 'Chrome' },
    brave: { service: 'Brave Safe Storage', account: 'Brave' },
    edge: { service: 'Microsoft Edge Safe Storage', account: 'Microsoft Edge' },
  };

const SALT = 'saltysalt';
const IV = Buffer.alloc(16, 0x20);

export function chromiumKey(password: string, iterations = process.platform === 'linux' ? 1 : 1003): Buffer {
  return pbkdf2Sync(password, SALT, iterations, 16, 'sha1');
}

/** Decrypts a `v10`/`v11` value, or returns plaintext bytes untouched; null when the key is wrong. */
export function decryptChromium(value: Buffer, key: Buffer): Buffer | null {
  if (value.length === 0) return value;
  const prefix = value.subarray(0, 3).toString('latin1');
  if (prefix !== 'v10' && prefix !== 'v11') return value;
  try {
    const d = createDecipheriv('aes-128-cbc', key, IV);
    return Buffer.concat([d.update(value.subarray(3)), d.final()]);
  } catch {
    return null;
  }
}

/** Test helper and inverse of `decryptChromium`. */
export function encryptChromium(plain: Buffer, key: Buffer): Buffer {
  const c = createCipheriv('aes-128-cbc', key, IV);
  return Buffer.concat([Buffer.from('v10', 'latin1'), c.update(plain), c.final()]);
}

/** Since Chromium 130 a decrypted cookie starts with SHA-256(host_key); older ones do not. */
export function stripCookieHash(plain: Buffer, hostKey: string): Buffer {
  if (plain.length < 32) return plain;
  const hash = createHash('sha256').update(hostKey).digest();
  return plain.subarray(0, 32).equals(hash) ? plain.subarray(32) : plain;
}

export interface ChromiumLoginRow {
  origin_url: string;
  username_value: string;
  password_value: Buffer | null;
  date_last_used: number | null;
  date_password_modified: number | null;
}

export interface ImportedCredential {
  origin: string;
  username: string;
  password: string;
  updatedAt: number;
  lastUsedAt: number | null;
}

export function loginsToCredentials(
  rows: ChromiumLoginRow[],
  key: Buffer,
  now: number,
): ImportedCredential[] {
  const out: ImportedCredential[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.password_value || !r.username_value) continue;
    let origin: string;
    try {
      origin = new URL(r.origin_url).origin;
      if (!/^https?:$/.test(new URL(origin).protocol)) continue;
    } catch {
      continue;
    }
    const plain = decryptChromium(r.password_value, key);
    if (!plain || plain.length === 0) continue;
    const password = plain.toString('utf8');
    const id = `${origin}\n${r.username_value}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const modified = r.date_password_modified ? chromeTimeToMs(r.date_password_modified) : 0;
    out.push({
      origin,
      username: r.username_value,
      password,
      updatedAt: modified > 0 ? modified : now,
      lastUsedAt: r.date_last_used ? chromeTimeToMs(r.date_last_used) : null,
    });
  }
  return out;
}

export interface ChromiumCookieRow {
  host_key: string;
  name: string;
  value: string;
  encrypted_value: Buffer | null;
  path: string;
  expires_utc: number;
  is_secure: number;
  is_httponly: number;
  samesite: number;
  has_expires: number;
}

export interface CookieToSet {
  url: string;
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number;
  sameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
}

const SAME_SITE: Record<number, CookieToSet['sameSite']> = {
  0: 'no_restriction',
  1: 'lax',
  2: 'strict',
};

export function cookieRowToSet(row: ChromiumCookieRow, key: Buffer, nowMs: number): CookieToSet | null {
  if (!row.name || !row.host_key) return null;
  let value = row.value;
  if (!value && row.encrypted_value && row.encrypted_value.length > 0) {
    const plain = decryptChromium(row.encrypted_value, key);
    if (!plain) return null;
    value = stripCookieHash(plain, row.host_key).toString('utf8');
  }
  const host = row.host_key.replace(/^\./, '');
  if (!host) return null;
  const secure = row.is_secure === 1;
  const out: CookieToSet = {
    url: `${secure ? 'https' : 'http'}://${host}${row.path || '/'}`,
    name: row.name,
    value,
    domain: row.host_key,
    path: row.path || '/',
    secure,
    httpOnly: row.is_httponly === 1,
    sameSite: SAME_SITE[row.samesite] ?? 'unspecified',
  };
  if (row.has_expires === 1 && row.expires_utc > 0) {
    const ms = chromeTimeToMs(row.expires_utc);
    if (ms <= nowMs) return null;
    out.expirationDate = Math.floor(ms / 1000);
  }
  return out;
}

/** Chromium `Local State` → `{ "Profile 3": "Work" }` (display names chosen by the user). */
export function profileNamesFromLocalState(json: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const profile = (json as { profile?: { info_cache?: Record<string, { name?: unknown }> } } | null)?.profile;
  const cache = profile?.info_cache;
  if (!cache || typeof cache !== 'object') return out;
  for (const [dir, info] of Object.entries(cache)) {
    if (info && typeof info.name === 'string' && info.name.trim()) out[dir] = info.name.trim();
  }
  return out;
}
