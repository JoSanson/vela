/** Geometry shared by main (native view bounds) and renderer (overlays, split handles). */
export const CONTENT_INSET = 8;
export const CONTENT_RADIUS = 10;
export const SPLIT_GUTTER = 6;
/** Strip of shell left visible when the sidebar is hidden, so hovering the edge can reveal it. */
export const HOVER_EDGE = 4;
export const FIND_BAR_HEIGHT = 44;
export const LITTLE_BAR_HEIGHT = 44;

export function topBarHeight(platform: string): number {
  return platform === 'darwin' ? 0 : 36;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContentLayoutInput {
  width: number;
  height: number;
  sidebarWidth: number;
  sidebarVisible: boolean;
  /** 0..1 while the sidebar slides; inset, radius and offset follow it so nothing jumps at the end. */
  sidebarReveal?: number | undefined;
  fullscreen: boolean;
  topStrip: number;
  platform: string;
}

export function sidebarReveal(i: Pick<ContentLayoutInput, 'sidebarVisible' | 'sidebarReveal'>): number {
  if (!i.sidebarVisible) return 0;
  return Math.min(1, Math.max(0, i.sidebarReveal ?? 1));
}

export function contentRadius(
  i: Pick<ContentLayoutInput, 'sidebarVisible' | 'sidebarReveal' | 'fullscreen'>,
): number {
  return i.fullscreen ? 0 : Math.round(CONTENT_RADIUS * sidebarReveal(i));
}

/** Region available to tab views, in window content coordinates. Single source of truth. */
export function contentBounds(i: ContentLayoutInput): Rect {
  const reveal = sidebarReveal(i);
  const shown = Math.round(i.sidebarWidth * reveal);
  const sidebar = i.fullscreen ? shown : Math.max(HOVER_EDGE, shown);
  const inset = i.fullscreen ? 0 : Math.round(CONTENT_INSET * reveal);
  const top = topBarHeight(i.platform) + i.topStrip;
  return {
    x: sidebar,
    y: top + inset,
    width: Math.max(0, i.width - sidebar - inset),
    height: Math.max(0, i.height - top - inset * 2),
  };
}

/** Splits `bounds` horizontally into panes with gutters; sizes are fractions summing to 1. */
export function paneRects(bounds: Rect, sizes: readonly number[]): Rect[] {
  const n = sizes.length;
  if (n === 0) return [];
  const gutter = n > 1 ? SPLIT_GUTTER : 0;
  const totalW = bounds.width - gutter * (n - 1);
  let x = bounds.x;
  return sizes.map((s, i) => {
    const last = i === n - 1;
    const w = last ? bounds.x + bounds.width - x : Math.round(totalW * s);
    const r = { x, y: bounds.y, width: Math.max(0, w), height: bounds.height };
    x += w + gutter;
    return r;
  });
}
