import { describe, expect, it } from 'vitest';
import { CONTENT_INSET, CONTENT_RADIUS, HOVER_EDGE, contentBounds, contentRadius } from './layout';

const base = {
  width: 1200,
  height: 800,
  sidebarWidth: 260,
  fullscreen: false,
  topStrip: 0,
  platform: 'darwin',
};

describe('contentBounds', () => {
  it('rests at the full inset when shown and at the hover edge when hidden', () => {
    expect(contentBounds({ ...base, sidebarVisible: true })).toEqual({
      x: 260,
      y: CONTENT_INSET,
      width: 1200 - 260 - CONTENT_INSET,
      height: 800 - CONTENT_INSET * 2,
    });
    expect(contentBounds({ ...base, sidebarVisible: false })).toEqual({
      x: HOVER_EDGE,
      y: 0,
      width: 1200 - HOVER_EDGE,
      height: 800,
    });
    expect(contentRadius({ sidebarVisible: true, fullscreen: false })).toBe(CONTENT_RADIUS);
    expect(contentRadius({ sidebarVisible: false, fullscreen: false })).toBe(0);
  });

  it('moves continuously while the sidebar slides, ending exactly on the hidden geometry', () => {
    let prev = contentBounds({ ...base, sidebarVisible: true, sidebarReveal: 1 });
    expect(prev).toEqual(contentBounds({ ...base, sidebarVisible: true }));
    for (let step = 99; step >= 0; step--) {
      const reveal = step / 100;
      const r = contentBounds({ ...base, sidebarVisible: true, sidebarReveal: reveal });
      expect(r.x).toBeLessThanOrEqual(prev.x);
      expect(r.y).toBeLessThanOrEqual(prev.y);
      expect(prev.x - r.x).toBeLessThanOrEqual(4);
      expect(prev.y - r.y).toBeLessThanOrEqual(1);
      expect(contentRadius({ sidebarVisible: true, fullscreen: false, sidebarReveal: reveal })).toBe(
        Math.round(CONTENT_RADIUS * reveal),
      );
      prev = r;
    }
    expect(prev).toEqual(contentBounds({ ...base, sidebarVisible: false }));
  });

  it('ignores the inset, edge and radius in fullscreen', () => {
    expect(contentBounds({ ...base, sidebarVisible: false, fullscreen: true })).toEqual({
      x: 0,
      y: 0,
      width: 1200,
      height: 800,
    });
    expect(contentBounds({ ...base, sidebarVisible: true, fullscreen: true }).x).toBe(260);
    expect(contentRadius({ sidebarVisible: true, fullscreen: true })).toBe(0);
  });
});
