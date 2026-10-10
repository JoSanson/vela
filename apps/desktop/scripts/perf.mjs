import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const needsBuild = !process.env.SKIP_BUILD || !existsSync(join(root, 'out/main/index.js'));

if (needsBuild) {
  const b = spawnSync('npx', ['electron-vite', 'build'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (b.status !== 0) process.exit(b.status ?? 1);
}

const runner = join(root, 'perf/run.mjs');
const useXvfb = process.platform === 'linux' && !process.env.DISPLAY;
if (useXvfb) {
  const r = spawnSync('xvfb-run', ['-a', '-s', '-screen 0 1600x1000x24', process.execPath, runner], {
    cwd: root,
    stdio: 'inherit',
  });
  process.exit(r.status ?? 1);
}

const { run } = await import(runner);
process.exit(await run());
