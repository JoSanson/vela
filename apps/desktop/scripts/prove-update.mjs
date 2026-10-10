// Proves the in-app update path between two real builds without GitHub:
//   1. package the current tree as v0.1.0 (A) and as v0.1.1 (B) for the current platform,
//   2. serve B's directory (installer + latest*.yml) over HTTP as a generic electron-updater feed,
//   3. launch A with VELA_UPDATE_URL pointing at that feed and watch the updater state machine.
// Usage: node scripts/prove-update.mjs [--skip-build] [--install]
import { _electron as electron } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
  createReadStream,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'release', 'update-proof');
const skipBuild = process.argv.includes('--skip-build');
const tryInstall = process.argv.includes('--install');
const FROM = '0.1.0';
const TO = '0.1.1';
const log = (...a) => process.stdout.write(`[update-proof] ${a.join(' ')}\n`);

function build(version, dir) {
  const target =
    process.platform === 'darwin'
      ? ['--mac', 'zip', `--${process.arch}`]
      : process.platform === 'win32'
        ? ['--win', 'nsis']
        : ['--linux', 'AppImage'];
  const args = [
    'electron-builder',
    '--config',
    'electron-builder.yml',
    '--publish',
    'never',
    ...target,
    `-c.extraMetadata.version=${version}`,
    `-c.directories.output=${dir}`,
  ];
  log(`building v${version} → ${dir}`);
  const r = spawnSync('npx', args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  });
  if (r.status !== 0) throw new Error(`electron-builder failed for ${version}`);
}

function executableOf(dir) {
  if (process.platform === 'darwin') {
    const app = readdirSync(join(dir, `mac-${process.arch}`)).find((f) => f.endsWith('.app'));
    return join(dir, `mac-${process.arch}`, app, 'Contents', 'MacOS', app.replace('.app', ''));
  }
  if (process.platform === 'win32') return join(dir, 'win-unpacked', 'Vela.exe');
  const appImage = readdirSync(dir).find((f) => f.endsWith('.AppImage'));
  return appImage ? join(dir, appImage) : join(dir, 'linux-unpacked', 'vela');
}

function serve(dir) {
  const server = createServer((req, res) => {
    const name = decodeURIComponent((req.url ?? '/').split('?')[0].replace(/^\/+/, ''));
    const file = join(dir, name);
    if (!name || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    const size = statSync(file).size;
    const range = req.headers.range;
    if (range) {
      const [s, e] = range
        .replace('bytes=', '')
        .split('-')
        .map((n) => (n ? Number(n) : undefined));
      const start = s ?? 0;
      const end = e ?? size - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
      });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Length': size, 'Accept-Ranges': 'bytes' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }),
    ),
  );
}

const a = join(out, 'a');
const b = join(out, 'b');
if (!skipBuild) {
  rmSync(out, { recursive: true, force: true });
  if (!existsSync(join(root, 'out', 'main', 'index.js'))) {
    const r = spawnSync('npx', ['electron-vite', 'build'], { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) process.exit(1);
  }
  build(FROM, a);
  build(TO, b);
}
const feedFiles = readdirSync(b).filter((f) => /^latest.*\.yml$/.test(f));
log('feed files in B:', feedFiles.join(', ') || '(none!)');
const { server, url } = await serve(b);
const userData = mkdtempSync(join(tmpdir(), 'vela-update-'));
const exe = executableOf(a);
log('launching A:', exe);
const app = await electron.launch({
  executablePath: exe,
  args: [],
  env: { ...process.env, VELA_USER_DATA: userData, VELA_E2E: '1', VELA_UPDATE_URL: url },
  timeout: 60_000,
});
await app.firstWindow();
const transitions = [];
const started = Date.now();
let last = '';
let final = null;
await app.evaluate(() => globalThis.__vela.ctx.updater.check());
while (Date.now() - started < 120_000) {
  const status = await app.evaluate(() => globalThis.__vela.ctx.updater.status);
  const key = `${status.state}:${status.version ?? ''}:${status.error ?? ''}`;
  if (key !== last) {
    transitions.push({ t: Date.now() - started, ...status });
    log(
      `${String(Date.now() - started).padStart(6)} ms  ${status.state}${status.version ? ` v${status.version}` : ''}${status.error ? `  (${status.error})` : ''}`,
    );
    last = key;
  }
  if (status.state === 'downloaded' || status.state === 'error' || status.state === 'up-to-date') {
    final = status;
    break;
  }
  await new Promise((r) => setTimeout(r, 250));
}
final ??= await app.evaluate(() => globalThis.__vela.ctx.updater.status);
const sawAvailable = transitions.some((s) => s.state === 'available' && s.version === TO);
const downloaded = final.state === 'downloaded' && final.version === TO;
const unsignedMac =
  process.platform === 'darwin' &&
  final.state === 'error' &&
  /sign|codesign|signature|ditto|squirrel/i.test(final.error ?? '');
let installed = null;
if (tryInstall && downloaded) {
  log('calling quitAndInstall()…');
  await app.evaluate(() => globalThis.__vela.ctx.updater.install());
  await new Promise((r) => setTimeout(r, 15_000));
  installed = 'requested (verify the relaunched app reports v' + TO + ')';
}
await app.close().catch(() => undefined);
server.close();
rmSync(userData, { recursive: true, force: true });

const verdict = downloaded
  ? 'PASS — update downloaded and sha512-verified'
  : sawAvailable && unsignedMac
    ? 'PASS (partial) — feed resolved and v0.1.1 detected; download/install needs a code-signed macOS build'
    : 'FAIL';
const report = `# Auto-update proof (v${FROM} → v${TO})

Generated by \`node scripts/prove-update.mjs\` on ${new Date().toISOString()} (${process.platform} ${process.arch}).

Feed: generic HTTP server over B's release directory (${feedFiles.join(', ')}).

| t (ms) | state | version | error |
| --- | --- | --- | --- |
${transitions.map((s) => `| ${s.t} | ${s.state} | ${s.version ?? ''} | ${s.error ?? ''} |`).join('\n')}

Verdict: **${verdict}**${installed ? `\n\nInstall: ${installed}` : ''}
`;
writeFileSync(join(root, '..', '..', 'UPDATE-PROOF.md'), report);
log(verdict);
process.exit(downloaded || (sawAvailable && unsignedMac) ? 0 : 1);
