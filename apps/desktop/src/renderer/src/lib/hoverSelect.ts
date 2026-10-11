import { useRef } from 'react';

/**
 * Lists that appear or re-render under a resting cursor (switcher, suggestions arriving) must not
 * steal the keyboard selection: only genuine pointer motion selects the row under the pointer.
 */
export function useHoverSelect(select: (i: number) => void): (i: number, e: React.MouseEvent) => void {
  const last = useRef<{ x: number; y: number } | null>(null);
  return (i, e) => {
    // Blink dispatches a synthetic mousemove under a resting pointer after layout changes: the
    // first event only records where the pointer is, a later one at another point is real motion.
    const prev = last.current;
    last.current = { x: e.clientX, y: e.clientY };
    if (!prev || (prev.x === e.clientX && prev.y === e.clientY)) return;
    select(i);
  };
}
