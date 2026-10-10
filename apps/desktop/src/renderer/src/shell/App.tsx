import { FIND_BAR_HEIGHT, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '@vela/shared';
import { animate } from 'motion';
import { useCallback, useEffect, useRef } from 'react';
import { Sidebar } from '../components/Sidebar/Sidebar';
import { invoke, modKey, vela } from '../lib/api';
import { connectStore, useShell } from '../lib/store';
import { applyTheme, systemPrefersDark } from '../lib/theme';
import { FindBar } from './FindBar';
import { SplitHandles } from './SplitHandles';
import styles from './App.module.css';

const HIDE_DURATION = 0.22;

export function App() {
  const ready = useShell((s) => s.ready);
  const core = useShell((s) => s.core);
  const sidebarVisible = useShell((s) => s.sidebarVisible);
  const sidebarWidth = useShell((s) => s.sidebarWidth);
  const findOpen = useShell((s) => s.findOpen);
  const topStrip = useShell((s) => s.topStrip);
  const setSidebarVisible = useShell((s) => s.setSidebarVisible);
  const setSidebarWidth = useShell((s) => s.setSidebarWidth);
  const setFindOpen = useShell((s) => s.setFindOpen);
  const setTopStrip = useShell((s) => s.setTopStrip);
  const asideRef = useRef<HTMLDivElement>(null);
  const animating = useRef(false);

  useEffect(() => connectStore(), []);

  const theme = core.spaces[core.activeSpaceId]?.theme;
  useEffect(() => {
    if (!theme) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => void applyTheme(theme, systemPrefersDark());
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    if (!ready || animating.current) return;
    vela.send('layout/set', { sidebarWidth, sidebarVisible, topStrip });
  }, [ready, sidebarWidth, sidebarVisible, topStrip]);

  const toggleSidebar = useCallback(() => {
    const el = asideRef.current;
    const show = !useShell.getState().sidebarVisible;
    const width = useShell.getState().sidebarWidth;
    const strip = useShell.getState().topStrip;
    void invoke('prefs/set', { sidebarHidden: !show });
    if (!el) {
      setSidebarVisible(show);
      return;
    }
    animating.current = true;
    if (show) setSidebarVisible(true);
    const from = show ? -width : 0;
    const to = show ? 0 : -width;
    animate(from, to, {
      duration: HIDE_DURATION,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (x) => {
        el.style.transform = `translateX(${x}px)`;
        vela.send('layout/set', {
          sidebarWidth: Math.max(0, width + x),
          sidebarVisible: true,
          topStrip: strip,
        });
      },
      onComplete: () => {
        animating.current = false;
        el.style.transform = '';
        if (!show) setSidebarVisible(false);
        vela.send('layout/set', { sidebarWidth: width, sidebarVisible: show, topStrip: strip });
      },
    });
  }, [setSidebarVisible]);

  const openFind = useCallback(() => {
    setFindOpen(true);
    setTopStrip(FIND_BAR_HEIGHT);
  }, [setFindOpen, setTopStrip]);
  const closeFind = useCallback(() => {
    setFindOpen(false);
    setTopStrip(0);
  }, [setFindOpen, setTopStrip]);

  useEffect(() => {
    return vela.on('ui/command', ({ id }) => {
      if (id === 'toggleSidebar') toggleSidebar();
      if (id === 'findInPage') openFind();
    });
  }, [toggleSidebar, openFind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && useShell.getState().findOpen) closeFind();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeFind]);

  const onResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = useShell.getState().sidebarWidth;
      const target = e.currentTarget as HTMLDivElement;
      target.setPointerCapture(e.pointerId);
      let w = startW;
      const move = (ev: PointerEvent): void => {
        w = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, startW + ev.clientX - startX));
        setSidebarWidth(w);
      };
      const up = (): void => {
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
        void invoke('prefs/set', { sidebarWidth: w });
      };
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
    },
    [setSidebarWidth],
  );

  const space = core.spaces[core.activeSpaceId];
  const hasActive = !!space?.activeTabId;

  return (
    <div className={styles.app} data-ready={ready ? 'true' : 'false'}>
      <div
        ref={asideRef}
        className={styles.asideWrap}
        style={{
          width: sidebarVisible ? sidebarWidth : 0,
          visibility: sidebarVisible ? 'visible' : 'hidden',
        }}
        aria-hidden={!sidebarVisible}
      >
        <Sidebar width={sidebarWidth} onToggle={toggleSidebar} />
        <div
          className={styles.resizer}
          onPointerDown={onResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuenow={sidebarWidth}
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setSidebarWidth(Math.max(SIDEBAR_MIN_WIDTH, sidebarWidth - 10));
            if (e.key === 'ArrowRight') setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, sidebarWidth + 10));
          }}
        />
      </div>
      {!sidebarVisible && (
        <div
          className={styles.edge}
          onMouseEnter={() => void invoke('overlay/show', { kind: 'sidebar' })}
          data-testid="sidebar-edge"
        />
      )}
      <main className={styles.content} data-testid="content" data-dnd-zone="content">
        {findOpen && <FindBar onClose={closeFind} />}
        {!hasActive && ready && (
          <div className={`${styles.empty} ${sidebarVisible ? '' : styles.emptyFull}`}>
            <div className={styles.emptyCard}>
              <div className={styles.emptyTitle}>
                {space?.emoji} {space?.name}
              </div>
              <p className={styles.emptyHint}>
                Press <kbd>{modKey}</kbd> <kbd>T</kbd> to open a tab
              </p>
            </div>
          </div>
        )}
      </main>
      <SplitHandles />
    </div>
  );
}
