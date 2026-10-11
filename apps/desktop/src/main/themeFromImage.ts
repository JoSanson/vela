import type { ThemePalette } from '@vela/shared';
import { dialog, nativeImage, type BrowserWindow } from 'electron';

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function hsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

/**
 * Picks two dominant, reasonably saturated colors from an image (quantised histogram), so a
 * wallpaper or logo becomes a space gradient.
 */
export function paletteFromBitmap(bitmap: Buffer, width: number, height: number): ThemePalette | null {
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < width * height; i++) {
    // Electron bitmaps are BGRA.
    const b = bitmap[i * 4] ?? 0;
    const g = bitmap[i * 4 + 1] ?? 0;
    const r = bitmap[i * 4 + 2] ?? 0;
    const [, s, l] = hsl(r, g, b);
    if (s < 0.18 || l < 0.12 || l > 0.92) continue;
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.n++;
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((x) => ({ r: x.r / x.n, g: x.g / x.n, b: x.b / x.n, n: x.n }));
  const first = ranked[0];
  if (!first) return null;
  const [h1] = hsl(first.r, first.g, first.b);
  const second =
    ranked.find((c) => {
      const [h2] = hsl(c.r, c.g, c.b);
      const dh = Math.min(Math.abs(h1 - h2), 1 - Math.abs(h1 - h2));
      return dh > 0.06;
    }) ?? ranked[1];
  const from = toHex(first.r, first.g, first.b);
  const to = second
    ? toHex(second.r, second.g, second.b)
    : toHex(Math.min(255, first.r * 1.25), Math.min(255, first.g * 1.1), Math.min(255, first.b * 1.25));
  return { from, to };
}

export function paletteFromFile(path: string): ThemePalette | null {
  const img = nativeImage.createFromPath(path);
  if (img.isEmpty()) return null;
  const small = img.resize({ width: 64, height: 64 });
  const { width, height } = small.getSize();
  return paletteFromBitmap(small.toBitmap(), width, height);
}

export async function pickImageAndExtract(
  win: BrowserWindow | undefined,
  labels: { title: string; filterName: string },
): Promise<ThemePalette | null> {
  const opts = {
    title: labels.title,
    properties: ['openFile' as const],
    filters: [{ name: labels.filterName, extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
  };
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  const file = res.filePaths[0];
  if (res.canceled || !file) return null;
  return paletteFromFile(file);
}
