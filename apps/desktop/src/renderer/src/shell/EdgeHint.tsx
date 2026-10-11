import { Spring, SPRING_CRISP } from '@vela/shared';
import { useEffect, useRef } from 'react';
import { Icon } from '../components/Icon';
import styles from './EdgeHint.module.css';

/** Pointer distance from the left edge (px) over which the hint slides in. */
const REACH = 40;
/** Arc's EdgeFeedbackView travel: off-screen at rest, 12 px in at full progress. */
const FROM_X = -35;
const TO_X = 12;

/**
 * The little tab that peeks out of the left edge when the sidebar is hidden and the pointer comes
 * close, before the floating sidebar appears (D033). Progress 0..1 follows the pointer through a
 * spring, so it eases in and settles back out instead of popping.
 */
export function EdgeHint() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const spring = new Spring(0, SPRING_CRISP);
    let raf = 0;
    let last = 0;
    const paint = (p: number): void => {
      el.style.transform = `translate3d(${FROM_X + p * (TO_X - FROM_X)}px, -50%, 0)`;
      el.style.opacity = String(Math.min(1, p * 1.5));
    };
    const frame = (now: number): void => {
      const dt = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      paint(spring.step(dt));
      if (spring.settled()) {
        raf = 0;
        last = 0;
        paint(spring.target);
      } else raf = requestAnimationFrame(frame);
    };
    const aim = (target: number): void => {
      if (reduced) {
        spring.snap(target);
        paint(target);
        return;
      }
      spring.target = target;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onMove = (e: MouseEvent): void => {
      aim(Math.max(0, Math.min(1, 1 - e.clientX / REACH)));
    };
    const onLeave = (): void => aim(0);
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    paint(0);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={styles.hint} ref={ref} aria-hidden="true" data-testid="edge-hint">
      <Icon name="sidebar" size={14} />
    </div>
  );
}
