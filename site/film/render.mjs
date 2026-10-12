// Renders the film frame by frame (deterministic) and encodes it.
//   node site/film/render.mjs preview 0 3.2 7.9 …   → PNG stills at those seconds (for review)
//   node site/film/render.mjs video                → film/out/vela-hero{,-960}.mp4 + poster (copy to src/assets/video)
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const siteDir = join(here, '..');
const outDir = join(here, 'out');
mkdirSync(outDir, { recursive: true });
const require = createRequire(join(here, '../../apps/desktop/package.json'));
const { chromium } = require('@playwright/test');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const server = createServer((req, res) => {
  const f = join(siteDir, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(siteDir) || !existsSync(f) || statSync(f).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.on('listening', r));
const url = `http://127.0.0.1:${server.address().port}/film/film.html?render`;

const [mode = 'preview', ...rest] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => window.filmReady);
const duration = await page.evaluate(() => window.FILM.DURATION);

if (mode === 'preview') {
  for (const s of rest.map(Number)) {
    await page.evaluate((t) => window.render(t), s);
    await page.screenshot({ path: join(outDir, `still-${String(s).padStart(5, '0')}.png`) });
  }
  console.info(`stills → ${outDir}`);
} else {
  // 120 frames per second blended down to 60: real motion blur on fast camera moves.
  const fps = Number(process.env.FPS ?? 120);
  const frames = Math.round(duration * fps);
  const master = join(outDir, 'master.mov');
  const ff = spawn(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'image2pipe',
      '-framerate',
      String(fps),
      '-c:v',
      'png',
      '-i',
      '-',
      '-c:v',
      'prores_ks',
      '-profile:v',
      '3',
      '-pix_fmt',
      'yuv422p10le',
      master,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.render(t), i / fps);
    const buf = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 120 === 0) console.info(`frame ${i}/${frames} · ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  const blend = fps > 60 ? `tmix=frames=${fps / 60}:weights='1 1',fps=60,` : '';
  const run = (args) =>
    new Promise((res, rej) =>
      spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' }).on('close', (c) =>
        c === 0 ? res() : rej(new Error(`ffmpeg ${c}`)),
      ),
    );
  await run([
    '-i',
    master,
    '-vf',
    `${blend}format=yuv420p`,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '18',
    '-movflags',
    '+faststart',
    '-an',
    join(outDir, 'vela-hero-1080.mp4'),
  ]);
  await run([
    '-i',
    master,
    '-vf',
    `${blend}scale=1600:-2:flags=lanczos,format=yuv420p`,
    '-c:v',
    'libx264',
    '-preset',
    'slower',
    '-crf',
    '27',
    '-movflags',
    '+faststart',
    '-an',
    join(outDir, 'vela-hero.mp4'),
  ]);
  await run([
    '-i',
    master,
    '-vf',
    `${blend}scale=960:-2:flags=lanczos,format=yuv420p`,
    '-c:v',
    'libx264',
    '-preset',
    'slower',
    '-crf',
    '27',
    '-movflags',
    '+faststart',
    '-an',
    join(outDir, 'vela-hero-960.mp4'),
  ]);
  // Fallback for Chromium builds without H.264; browsers that play the MP4 never fetch it.
  await run([
    '-i',
    master,
    '-vf',
    `${blend}scale=1600:-2:flags=lanczos,format=yuv420p`,
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '0',
    '-crf',
    '50',
    '-row-mt',
    '1',
    '-cpu-used',
    '2',
    '-an',
    join(outDir, 'vela-hero.webm'),
  ]);
  await run([
    '-i',
    join(outDir, 'vela-hero-1080.mp4'),
    '-ss',
    '13.6',
    '-frames:v',
    '1',
    '-vf',
    'scale=1600:-2',
    '-q:v',
    '3',
    join(outDir, 'vela-hero-poster.jpg'),
  ]);
  console.info(`video → ${outDir} in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
await browser.close();
server.close();
