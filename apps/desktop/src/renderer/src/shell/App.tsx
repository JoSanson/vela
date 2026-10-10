import { FIND_BAR_HEIGHT, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, shortcutForEvent } from '@vela/shared';
import { useCallback, useEffect, useRef } from 'react';
import { Sidebar } from '../components/Sidebar/Sidebar';
import { invoke, modKey, vela } from '../lib/api';
import { connectStore, selectActiveTab, useShell } from '../lib/store';
import { applyTheme, systemPrefersDark } from '../lib/theme';
import { DownloadsPanel } from './DownloadsPanel';
import { FindBar } from './FindBar';
import { SiteControl } from './SiteControl';
import { SplitHandles } from './SplitHandles';
import { TopBar } from './TopBar';
import styles from './App.module.css';

const HIDE_DURATION = 0.22;

/** cubic-bezier(0.22, 1, 0.36, 1) sampled by t — close enough for a 220 ms slide. */
const easeOutQuint = (t: number): number => 1 - Math.pow(1 - t, 5);

function tween(
  from: number,
  to: number,
  ms: number,
  cb: { onUpdate: (v: number) => void; onComplete: () => void },
): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    cb.onUpdate(to);
    cb.onComplete();
    return;
  }
  const start = performance.now();
  const frame = (now: number): void => {
    const t = Math.min(1, (now - start) / ms);
    cb.onUpdate(from + (to - from) * easeOutQuint(t));
    if (t < 1) requestAnimationFrame(frame);
    else cb.onComplete();
  };
  requestAnimationFrame(frame);
}

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
  const downloadsOpen = useShell((s) => s.downloadsOpen);
  const siteControlOpen = useShell((s) => s.siteControlOpen);
  const setSiteControlOpen = useShell((s) => s.setSiteControlOpen);
  const activeTab = useShell(selectActiveTab);
  const glass = useShell((s) => s.prefs.glass);
  const setDownloadsOpen = useShell((s) => s.setDownloadsOpen);
  const toast = useShell((s) => s.toast);
  const showToast = useShell((s) => s.showToast);
  const asideRef = useRef<HTMLDivElement>(null);
  const animating = useRef(false);

  useEffect(() => connectStore(), []);
  useEffect(() => {
    if (ready) vela.send('perf/mark', { name: 'sidebarInteractive', at: Date.now() });
  }, [ready]);

  const theme = core.spaces[core.activeSpaceId]?.theme;
  const themePref = useShell((s) => s.prefs.theme);
  useEffect(() => {
    if (!theme) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => void applyTheme(theme, systemPrefersDark(), themePref);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme, themePref]);

  useEffect(() => {
    document.documentElement.dataset.glass = glass ? 'true' : 'false';
  }, [glass]);

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
    tween(from, to, HIDE_DURATION * 1000, {
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
    return vela.on('ui/command', ({ id, payload }) => {
      if (id === 'toggleSidebar') toggleSidebar();
      if (id === 'findInPage') openFind();
      if (id === 'toggleDownloads') setDownloadsOpen(!useShell.getState().downloadsOpen);
      if (id === 'showDownloads') setDownloadsOpen(true);
      if (id === 'editSpace') void invoke('overlay/show', { kind: 'spaceEditor', payload });
      if (id === 'toast') {
        const p = payload as
          | {
              text?: string;
              action?: { label: string; invoke: 'downloads/action'; req: { id: string; action: 'keep' } };
            }
          | undefined;
        const action = p?.action;
        showToast({
          text: String(p?.text ?? ''),
          ...(action
            ? { action: { label: action.label, run: () => void invoke(action.invoke, action.req) } }
            : {}),
        });
      }
    });
  }, [toggleSidebar, openFind, setDownloadsOpen, showToast]);

  // Files dropped anywhere on the shell open as tabs (web pages, PDFs, images).
  const onDrop = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    for (const file of Array.from(e.dataTransfer.files)) {
      const path = vela.pathForFile?.(file);
      if (path) void invoke('tab/openPath', { path });
    }
  }, []);
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault();
  }, []);

  useEffect(() => {
    return vela.on('zap/pick', ({ selector }) => {
      showToast({ text: `Zapped ${selector.length > 40 ? `${selector.slice(0, 40)}…` : selector}` });
    });
  }, [showToast]);
  useEffect(() => {
    if (!toast) return;
    // Sidebar hidden: the shell is fully covered by the page view, so the overlay shows the toast.
    if (!sidebarVisible) void invoke('overlay/show', { kind: 'toast', payload: { text: toast.text } });
    const t = setTimeout(() => showToast(null), toast.action ? 5000 : 2600);
    return () => clearTimeout(t);
  }, [toast, showToast, sidebarVisible]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && useShell.getState().findOpen) closeFind();
      if (e.defaultPrevented || e.target instanceof HTMLInputElement) return;
      const id = shortcutForEvent(e, vela.platform);
      if (id) {
        e.preventDefault();
        void invoke('command/run', { id });
      }
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
    <div className={styles.app} data-ready={ready ? 'true' : 'false'} onDrop={onDrop} onDragOver={onDragOver}>
      <TopBar />
      <div className={styles.row}>
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
          {downloadsOpen && <DownloadsPanel onClose={() => setDownloadsOpen(false)} />}
          {siteControlOpen && activeTab && (
            <SiteControl tab={activeTab} onClose={() => setSiteControlOpen(false)} />
          )}
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
      </div>
      <SplitHandles />
      {toast && sidebarVisible && (
        <div
          className={styles.toast}
          role="status"
          data-testid="toast"
          style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
        >
          <span>{toast.text}</span>
          {toast.action && (
            <button
              className={styles.toastAction}
              onClick={() => {
                toast.action?.run();
                showToast(null);
              }}
              data-testid="toast-action"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
