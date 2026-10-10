import { useLayoutEffect, useRef, type RefObject } from 'react';

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** Above this many moved rows (a restore, "undo close N"…) the glide is skipped: it would only read as noise. */
const MAX_ANIMATED = 24;
/** Order changes closer than this are a burst (session restore, open-all): no animation at all. */
const BURST_MS = 80;

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * FLIP for lists: children carrying `data-flip-key` glide from their previous position to the new
 * one (transform only, compositor-driven) and rows that did not exist before fade in. Only rows
 * inside the scroll viewport are measured and animated, in-flight animations are cancelled before
 * new ones start, and bursts of changes fall back to instant layout (measured: 150 rapid opens
 * otherwise spawn 2500 concurrent animations).
 */
export function useFlip<T extends HTMLElement>(orderKey: string): RefObject<T | null> {
  const ref = useRef<T>(null);
  const prev = useRef(new Map<string, DOMRect>());
  const lastChange = useRef(0);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const now = performance.now();
    const burst = now - lastChange.current < BURST_MS;
    lastChange.current = now;
    const old = prev.current;
    const next = new Map<string, DOMRect>();
    const scroller = root.closest<HTMLElement>('[data-flip-viewport]') ?? root;
    const vp = scroller.getBoundingClientRect();
    const rows = root.querySelectorAll<HTMLElement>('[data-flip-key]');
    const animate = !reducedMotion() && !burst && old.size > 0;
    const moved: { el: HTMLElement; dx: number; dy: number }[] = [];
    const fresh: HTMLElement[] = [];
    for (const el of rows) {
      const key = el.dataset.flipKey ?? '';
      const rect = el.getBoundingClientRect();
      next.set(key, rect);
      if (!animate) continue;
      if (rect.bottom < vp.top - 64 || rect.top > vp.bottom + 64) continue;
      const before = old.get(key);
      if (!before) {
        fresh.push(el);
        continue;
      }
      const dx = before.left - rect.left;
      const dy = before.top - rect.top;
      if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) moved.push({ el, dx, dy });
    }
    prev.current = next;
    if (!animate || moved.length + fresh.length > MAX_ANIMATED) {
      for (const el of rows) for (const a of el.getAnimations()) a.cancel();
      return;
    }
    for (const el of fresh) {
      for (const a of el.getAnimations()) a.cancel();
      el.animate(
        [
          { opacity: 0, transform: 'translateX(-8px)' },
          { opacity: 1, transform: 'none' },
        ],
        {
          duration: 200,
          easing: EASE,
        },
      );
    }
    for (const { el, dx, dy } of moved) {
      for (const a of el.getAnimations()) a.cancel();
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: 220,
        easing: EASE,
      });
    }
  }, [orderKey]);
  return ref;
}
