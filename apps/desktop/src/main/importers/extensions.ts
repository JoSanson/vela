import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

export interface ChromiumExtension {
  id: string;
  name: string;
  icon: string | null;
}

interface Manifest {
  name?: string;
  default_locale?: string;
  update_url?: string;
  icons?: Record<string, string>;
  theme?: unknown;
  app?: unknown;
}

const WEB_STORE_UPDATE = 'clients2.google.com/service/update2/crx';
const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const dirs = (path: string): string[] => {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
};

function localised(dir: string, m: Manifest, value: string): string {
  const key = /^__MSG_(.+)__$/.exec(value)?.[1];
  if (!key) return value;
  for (const locale of [m.default_locale, 'en'].filter((l): l is string => !!l)) {
    try {
      const messages = JSON.parse(
        readFileSync(join(dir, '_locales', locale, 'messages.json'), 'utf8'),
      ) as Record<string, { message?: string }>;
      const hit = Object.entries(messages).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1]?.message;
      if (hit) return hit;
    } catch {
      /* try the next locale */
    }
  }
  return value;
}

function largestIcon(dir: string, icons: Manifest['icons']): string | null {
  const best = Object.entries(icons ?? {})
    .map(([size, path]) => ({ size: Number(size), path }))
    .filter((i) => i.size > 0 && i.size <= 128)
    .sort((a, b) => b.size - a.size)[0];
  if (!best) return null;
  const file = join(dir, best.path.replace(/^\/+/, ''));
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime || !existsSync(file)) return null;
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}

/**
 * The Chrome Web Store extensions installed in a Chromium user-data directory (Arc, Chrome…),
 * across the given profiles, deduplicated by id. Built-ins (no Web Store update URL), themes and
 * hosted apps are left out: only what the Web Store can install again.
 */
export function readChromiumExtensions(userData: string, profiles: string[]): ChromiumExtension[] {
  const out = new Map<string, ChromiumExtension>();
  for (const profile of profiles) {
    const root = join(userData, profile, 'Extensions');
    for (const id of dirs(root)) {
      if (out.has(id)) continue;
      const version = dirs(join(root, id)).sort().pop();
      if (!version) continue;
      const dir = join(root, id, version);
      let m: Manifest;
      try {
        m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest;
      } catch {
        continue;
      }
      if (!m.update_url?.includes(WEB_STORE_UPDATE) || m.theme || m.app || !m.name) continue;
      out.set(id, { id, name: localised(dir, m, m.name), icon: largestIcon(dir, m.icons) });
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
