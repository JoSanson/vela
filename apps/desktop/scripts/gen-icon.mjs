// Renders the app icon (SVG → 1024 px PNG) with Electron itself, so no image library is needed.
// Usage: npx electron scripts/gen-icon.mjs   (run from apps/desktop)
import { app, BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'resources');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5B6CFF"/><stop offset="1" stop-color="#9A5BFF"/>
    </linearGradient>
    <linearGradient id="sail" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9e7ff"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#1b1446" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect x="64" y="64" width="896" height="896" rx="224" fill="url(#bg)"/>
  <g filter="url(#shadow)">
    <path d="M300 300 L512 760 L724 300" fill="none" stroke="url(#sail)" stroke-width="118" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <circle cx="512" cy="292" r="46" fill="#ffffff" opacity="0.9"/>
</svg>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 1024,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  await win.loadURL(
    `data:text/html,<body style="margin:0;background:transparent">${encodeURIComponent(svg)}</body>`,
  );
  await new Promise((r) => setTimeout(r, 300));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'icon.png'), image.toPNG());
  mkdirSync(join(out, 'icons'), { recursive: true });
  for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
    writeFileSync(
      join(out, 'icons', `${size}x${size}.png`),
      image.resize({ width: size, height: size }).toPNG(),
    );
  }
  process.stdout.write(`icon written to ${out}\n`);
  app.exit(0);
});
