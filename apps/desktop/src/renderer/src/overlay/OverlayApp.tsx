import { Spring, SPRING_CRISP } from '@vela/shared';
import { useEffect, useRef, useState } from 'react';
import { Sidebar } from '../components/Sidebar/Sidebar';
import { invoke, vela } from '../lib/api';
import { connectStore, useShell } from '../lib/store';
import { applyTheme, systemPrefersDark } from '../lib/theme';
import { CommandBar, type CommandBarPayload } from './CommandBar';
import { PeekChrome } from './PeekChrome';
import { AuthPromptView } from './AuthPrompt';
import { AutofillPopover, SavePasswordView } from './Autofill';
import { ExternalPromptView } from './ExternalPrompt';
import { PermissionPromptView } from './PermissionPrompt';
import { UpdateNotes, type UpdateNotesPayload } from './UpdateNotes';
import type {
  AuthPrompt,
  AutofillPrompt,
  ExternalPrompt,
  PermissionPrompt,
  SavePasswordPrompt,
} from '@vela/shared';
import { SpaceEditor, type SpaceEditorPayload } from './SpaceEditor';
import { SpacesPalette } from './SpacesPalette';
import { Switcher, type SwitcherPayload } from './Switcher';
import styles from './OverlayApp.module.css';

export function OverlayApp() {
  const overlay = useShell((s) => s.overlay);
  const core = useShell((s) => s.core);
  const sidebarWidth = useShell((s) => s.sidebarWidth);

  useEffect(() => connectStore(), []);

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
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void invoke('overlay/hide', undefined);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    return vela.on('ui/command', ({ id }) => {
      if (id === 'closeOverlay') void invoke('overlay/hide', undefined);
    });
  }, []);

  const hide = (): void => void invoke('overlay/hide', undefined);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Main keeps the native view attached for a beat after hiding so the exit can play here.
  const [shown, setShown] = useState(overlay);
  if (overlay.kind !== 'none' && shown !== overlay) setShown(overlay);
  const exiting = overlay.kind === 'none' && shown.kind !== 'none';
  useEffect(() => {
    if (overlay.kind !== 'none') return;
    // The floating sidebar slides all the way out on a spring; the others fade in 90 ms.
    const t = setTimeout(() => setShown(overlay), shown.kind === 'sidebar' ? SIDEBAR_EXIT_MS : 90);
    return () => clearTimeout(t);
  }, [overlay, shown.kind]);

  if (shown.kind === 'none') return <div className={styles.root} data-kind="none" />;
  const view = exiting ? shown : overlay;

  return (
    <div
      className={`${styles.root} ${exiting ? styles.exiting : ''}`}
      data-kind={exiting ? 'none' : view.kind}
      data-exit={exiting ? shown.kind : undefined}
      data-testid={exiting ? undefined : 'overlay'}
    >
      <div className={styles.backdrop} onMouseDown={hide} data-testid="overlay-backdrop" />
      {view.kind === 'commandBar' && <CommandBar payload={view.payload as CommandBarPayload} />}
      {view.kind === 'switcher' && <Switcher payload={view.payload as SwitcherPayload} />}
      {view.kind === 'spaces' && <SpacesPalette />}
      {view.kind === 'spaceEditor' && (
        <SpaceEditor key={JSON.stringify(view.payload)} payload={view.payload as SpaceEditorPayload} />
      )}
      {view.kind === 'peek' && <PeekChrome />}
      {view.kind === 'permissionPrompt' && (
        <PermissionPromptView initial={view.payload as PermissionPrompt} />
      )}
      {view.kind === 'authPrompt' && <AuthPromptView initial={view.payload as AuthPrompt} />}
      {view.kind === 'externalPrompt' && <ExternalPromptView initial={view.payload as ExternalPrompt} />}
      {view.kind === 'autofill' && <AutofillPopover initial={view.payload as AutofillPrompt} />}
      {view.kind === 'savePassword' && <SavePasswordView initial={view.payload as SavePasswordPrompt} />}
      {view.kind === 'updateNotes' && <UpdateNotes payload={view.payload as UpdateNotesPayload} />}
      {view.kind === 'toast' && (
        <OverlayToast text={String((view.payload as { text?: string } | null)?.text ?? '')} />
      )}
      {view.kind === 'sidebar' && (
        <FloatingSidebar
          width={sidebarWidth}
          exiting={exiting}
          onLeave={() => {
            leaveTimer.current = setTimeout(hide, 140);
          }}
          onEnter={() => {
            if (leaveTimer.current) clearTimeout(leaveTimer.current);
            leaveTimer.current = null;
            // Hovered again while sliding out: bring it back from where it is.
            if (exiting) void invoke('overlay/show', { kind: 'sidebar', payload: { width: sidebarWidth } });
          }}
          onToggle={() => {
            void invoke('command/run', { id: 'toggleSidebar' });
            hide();
          }}
        />
      )}
    </div>
  );
}

/** Main detaches the overlay view this long after hiding the floating sidebar (mirrors overlay.ts). */
const SIDEBAR_EXIT_MS = 420;

/**
 * The hover sidebar rides a spring (D033): in from the edge on show, back out on hide, and a
 * re-hover mid-flight simply retargets it, velocity intact, instead of restarting a keyframe.
 */
function FloatingSidebar({
  width,
  exiting,
  onLeave,
  onEnter,
  onToggle,
}: {
  width: number;
  exiting: boolean;
  onLeave: () => void;
  onEnter: () => void;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const spring = useRef<Spring | null>(null);
  const raf = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const s = spring.current ?? new Spring(-width, SPRING_CRISP);
    spring.current = s;
    s.target = exiting ? -width : 0;
    const paint = (x: number): void => {
      const v = Math.max(-width, Math.min(0, x));
      el.style.transform = `translate3d(${v}px, 0, 0)`;
      el.style.opacity = String(Math.min(1, ((v + width) / width) * 2 + 0.05));
    };
    if (reduced) {
      s.snap(s.target);
      paint(s.target);
      return;
    }
    let last = 0;
    const frame = (now: number): void => {
      const dt = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      paint(s.step(dt));
      if (s.settled(width)) {
        paint(s.target);
        raf.current = 0;
      } else raf.current = requestAnimationFrame(frame);
    };
    if (!raf.current) raf.current = requestAnimationFrame(frame);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [exiting, width]);
  return (
    <div
      className={styles.floatingSidebar}
      ref={ref}
      onMouseLeave={onLeave}
      onMouseEnter={onEnter}
      style={{ transform: `translate3d(${-width}px, 0, 0)`, opacity: 0 }}
    >
      <Sidebar width={width} onToggle={onToggle} floating />
    </div>
  );
}

function OverlayToast({ text }: { text: string }) {
  useEffect(() => {
    const t = setTimeout(() => {
      if (useShell.getState().overlay.kind === 'toast') void invoke('overlay/hide', undefined);
    }, 2600);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <div className={styles.toast} role="status" data-testid="overlay-toast">
      {text}
    </div>
  );
}
