// Downloads Ghostery's prebuilt EasyList + EasyPrivacy engine and stores it serialized in
// resources/adblock/engine.bin so the app never parses filter lists in the main process.
// Runs before build/dev; keeps the previous file when offline.
import { ElectronBlocker } from '@ghostery/adblocker-electron';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'adblock');
const file = join(dir, 'engine.bin');
const MAX_AGE_MS = 24 * 3600 * 1000;

if (
  existsSync(file) &&
  Date.now() - statSync(file).mtimeMs < MAX_AGE_MS &&
  !process.argv.includes('--force')
) {
  process.stdout.write(`[adblock] engine.bin is fresh, skipping\n`);
  process.exit(0);
}

try {
  const engine = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
  const bytes = engine.serialize();
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, bytes);
  writeFileSync(
    join(dir, 'engine.json'),
    JSON.stringify({ fetchedAt: new Date().toISOString(), bytes: bytes.byteLength }),
  );
  process.stdout.write(`[adblock] wrote ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB engine\n`);
} catch (err) {
  process.stdout.write(
    `[adblock] fetch failed (${err instanceof Error ? err.message : String(err)}); ${existsSync(file) ? 'keeping previous engine' : 'no engine available'}\n`,
  );
}
