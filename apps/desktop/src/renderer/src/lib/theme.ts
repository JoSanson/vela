import type { SpaceTheme } from '@vela/core';

export type ResolvedMode = 'light' | 'dark';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function resolveMode(theme: SpaceTheme, systemDark: boolean): ResolvedMode {
  if (theme.mode === 'light') return 'light';
  if (theme.mode === 'dark') return 'dark';
  return systemDark ? 'dark' : 'light';
}

/** Applies the space theme as CSS variables on <html>. */
export function applyTheme(theme: SpaceTheme, systemDark: boolean): ResolvedMode {
  const root = document.documentElement;
  const mode = resolveMode(theme, systemDark);
  root.dataset.mode = mode;
  root.style.setProperty('--space-from', theme.from);
  root.style.setProperty('--space-to', theme.to);
  root.style.setProperty('--grain', String(theme.grain));
  return mode;
}

export function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
