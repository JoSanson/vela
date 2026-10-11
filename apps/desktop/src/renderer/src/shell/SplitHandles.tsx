import { contentBounds, paneRects, SPLIT_GUTTER } from '@vela/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { dispatch, vela } from '../lib/api';
import { useT } from '../lib/i18n';
import { useShell } from '../lib/store';
import styles from './SplitHandles.module.css';

/** Resize handles drawn in the gutters between split panes (the only shell pixels visible there). */
export function SplitHandles() {
  const core = useShell((s) => s.core);
  const sidebarVisible = useShell((s) => s.sidebarVisible);
  const sidebarWidth = useShell((s) => s.sidebarWidth);
  const fullscreen = useShell((s) => s.fullscreen);
  const topStrip = useShell((s) => s.topStrip);
  const t = useT();
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const dragging = useRef<{ index: number; startX: number; sizes: number[]; total: number } | null>(null);

  useEffect(() => {
    const onResize = (): void => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const space = core.spaces[core.activeSpaceId];
  const split = space?.split;

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, index: number) => {
      if (!split || !space) return;
      e.preventDefault();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const bounds = contentBounds({
        width: size.w,
        height: size.h,
        sidebarWidth,
        sidebarVisible,
        fullscreen,
        topStrip,
        platform: vela.platform,
      });
      dragging.current = {
        index,
        startX: e.clientX,
        sizes: [...split.sizes],
        total: bounds.width - SPLIT_GUTTER * (split.panes.length - 1),
      };
      let raf = 0;
      let pendingSizes: number[] | null = null;
      const move = (ev: PointerEvent): void => {
        const d = dragging.current;
        if (!d) return;
        const delta = (ev.clientX - d.startX) / d.total;
        const a = d.sizes[d.index] ?? 0;
        const b = d.sizes[d.index + 1] ?? 0;
        const min = 0.15;
        const na = Math.min(a + b - min, Math.max(min, a + delta));
        const nb = a + b - na;
        const next = [...d.sizes];
        next[d.index] = na;
        next[d.index + 1] = nb;
        pendingSizes = next;
        if (!raf) {
          raf = requestAnimationFrame(() => {
            raf = 0;
            if (pendingSizes) dispatch({ type: 'split/resize', spaceId: space.id, sizes: pendingSizes });
          });
        }
      };
      const up = (): void => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        dragging.current = null;
        if (pendingSizes) dispatch({ type: 'split/resize', spaceId: space.id, sizes: pendingSizes });
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    },
    [split, space, size, sidebarWidth, sidebarVisible, fullscreen, topStrip],
  );

  if (!split || split.panes.length < 2) return null;
  const bounds = contentBounds({
    width: size.w,
    height: size.h,
    sidebarWidth,
    sidebarVisible,
    fullscreen,
    topStrip,
    platform: vela.platform,
  });
  const rects = paneRects(bounds, split.sizes);
  return (
    <>
      {rects.slice(0, -1).map((r, i) => (
        <div
          key={split.panes[i]}
          className={styles.handle}
          style={{ left: r.x + r.width, top: r.y, height: r.height, width: SPLIT_GUTTER }}
          onPointerDown={(e) => onPointerDown(e, i)}
          onDoubleClick={() =>
            dispatch({
              type: 'split/resize',
              spaceId: space.id,
              sizes: split.panes.map(() => 1 / split.panes.length),
            })
          }
          role="separator"
          aria-orientation="vertical"
          aria-label={t('shell.splitHandles.resizePane', { n: i + 1 })}
          data-testid="split-handle"
        />
      ))}
    </>
  );
}
