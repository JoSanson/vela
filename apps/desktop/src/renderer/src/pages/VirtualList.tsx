import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styles from './VirtualList.module.css';

interface Props<T> {
  rows: readonly T[];
  rowHeight: (row: T, index: number) => number;
  rowKey: (row: T, index: number) => string;
  renderRow: (row: T, index: number) => ReactNode;
  /** Index to keep in view (keyboard navigation). */
  scrollToIndex?: number | null;
  overscan?: number;
  footer?: ReactNode;
  testId?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  ariaLabel?: string;
}

function lowerBound(offsets: readonly number[], value: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((offsets[mid] ?? 0) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Windowed list: only rows intersecting the viewport (+overscan) are mounted. Owns its scroll container. */
export function VirtualList<T>({
  rows,
  rowHeight,
  rowKey,
  renderRow,
  scrollToIndex,
  overscan = 240,
  footer,
  testId,
  onKeyDown,
  ariaLabel,
}: Props<T>) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(800);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h !== undefined) setViewport(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const offsets = useMemo(() => {
    const out = new Array<number>(rows.length + 1);
    let acc = 0;
    for (let i = 0; i < rows.length; i += 1) {
      out[i] = acc;
      const row = rows[i];
      acc += row === undefined ? 0 : rowHeight(row, i);
    }
    out[rows.length] = acc;
    return out;
  }, [rows, rowHeight]);

  const total = offsets[rows.length] ?? 0;
  const start = Math.max(0, lowerBound(offsets, scrollTop - overscan) - 1);
  const end = Math.min(rows.length, lowerBound(offsets, scrollTop + viewport + overscan) + 1);

  useEffect(() => {
    const el = scroller.current;
    if (!el || scrollToIndex === null || scrollToIndex === undefined || scrollToIndex < 0) return;
    const top = offsets[scrollToIndex] ?? 0;
    const bottom = offsets[scrollToIndex + 1] ?? top;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
  }, [scrollToIndex, offsets]);

  const visible: ReactNode[] = [];
  for (let i = start; i < end; i += 1) {
    const row = rows[i];
    if (row === undefined) continue;
    visible.push(
      <div
        key={rowKey(row, i)}
        className={styles.row}
        style={{
          transform: `translateY(${offsets[i] ?? 0}px)`,
          height: (offsets[i + 1] ?? 0) - (offsets[i] ?? 0),
        }}
      >
        {renderRow(row, i)}
      </div>,
    );
  }

  return (
    <div
      ref={scroller}
      className={styles.scroller}
      data-testid={testId}
      role="list"
      aria-label={ariaLabel}
      tabIndex={onKeyDown ? 0 : undefined}
      onKeyDown={onKeyDown}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div className={styles.spacer} style={{ height: total }}>
        {visible}
      </div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}
