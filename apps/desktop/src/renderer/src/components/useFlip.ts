import { useLayoutEffect, useRef, type RefObject } from 'react';

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * FLIP for lists: children carrying `data-flip-key` glide from their previous position to the new
 * one (transform only, compositor-driven) and rows that did not exist before fade in. Rects are
 * only read when `orderKey` changes, so title/favicon patches never force a layout.
 */
export function useFlip<T extends HTMLElement>(orderKey: string): RefObject<T | null> {
  const ref = useRef<T>(null);
  const prev = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const next = new Map<string, DOMRect>();
    const old = prev.current;
    const animate = !reducedMotion() && old.size > 0;
    for (const el of root.querySelectorAll<HTMLElement>('[data-flip-key]')) {
      const key = el.dataset.flipKey ?? '';
      const rect = el.getBoundingClientRect();
      next.set(key, rect);
      if (!animate) continue;
      const before = old.get(key);
      if (!before) {
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
        continue;
      }
      const dx = before.left - rect.left;
      const dy = before.top - rect.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: 220,
        easing: EASE,
      });
    }
    prev.current = next;
  }, [orderKey]);
  return ref;
}
