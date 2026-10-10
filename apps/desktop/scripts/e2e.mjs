import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const needsBuild = !process.env.SKIP_BUILD || !existsSync(join(root, 'out/main/index.js'));

if (needsBuild) {
  const b = spawnSync('npx', ['electron-vite', 'build'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (b.status !== 0) process.exit(b.status ?? 1);
}

const useXvfb = process.platform === 'linux' && !process.env.DISPLAY;
const cmd = useXvfb ? 'xvfb-run' : 'npx';
const cmdArgs = useXvfb
  ? ['-a', '-s', '-screen 0 1600x1000x24', 'npx', 'playwright', 'test', ...args]
  : ['playwright', 'test', ...args];
const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
