import { useRef } from 'react';

/**
 * Lists that appear or re-render under a resting cursor (switcher, suggestions arriving) must not
 * steal the keyboard selection: only genuine pointer motion selects the row under the pointer.
 */
export function useHoverSelect(select: (i: number) => void): (i: number, e: React.MouseEvent) => void {
  const last = useRef({ x: -1, y: -1 });
  return (i, e) => {
    if (e.clientX === last.current.x && e.clientY === last.current.y) return;
    last.current = { x: e.clientX, y: e.clientY };
    select(i);
  };
}
