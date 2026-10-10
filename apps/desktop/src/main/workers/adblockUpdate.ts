// Runs in a utilityProcess: fetching + parsing the filter lists is memory-hungry (~200 MB peak),
// so it never happens in the main process. The serialized engine is written to disk and the
// process exits; main deserializes the file (a few MB) and reports the result.
import { ElectronBlocker } from '@ghostery/adblocker-electron';
import { writeFile } from 'node:fs/promises';

const target = process.argv[2];

async function main(): Promise<void> {
  if (!target) throw new Error('missing target path');
  const engine = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
  const bytes = engine.serialize();
  await writeFile(target, bytes);
  process.parentPort.postMessage({ ok: true, bytes: bytes.byteLength });
}

main()
  .catch((err: unknown) => {
    process.parentPort.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  })
  .finally(() => setTimeout(() => process.exit(0), 50));
