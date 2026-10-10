import { useEffect, useRef, useState } from 'react';
import { Sidebar } from '../components/Sidebar/Sidebar';
import { invoke, vela } from '../lib/api';
import { connectStore, useShell } from '../lib/store';
import { applyTheme, systemPrefersDark } from '../lib/theme';
import { CommandBar, type CommandBarPayload } from './CommandBar';
import { PeekChrome } from './PeekChrome';
import { PermissionPromptView } from './PermissionPrompt';
import { UpdateNotes, type UpdateNotesPayload } from './UpdateNotes';
import type { PermissionPrompt } from '@vela/shared';
import { SpaceEditor, type SpaceEditorPayload } from './SpaceEditor';
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
    const t = setTimeout(() => setShown(overlay), 90);
    return () => clearTimeout(t);
  }, [overlay]);

  if (shown.kind === 'none') return <div className={styles.root} data-kind="none" />;
  const view = exiting ? shown : overlay;

  return (
    <div
      className={`${styles.root} ${exiting ? styles.exiting : ''}`}
      data-kind={exiting ? 'none' : view.kind}
      data-testid={exiting ? undefined : 'overlay'}
    >
      <div className={styles.backdrop} onMouseDown={hide} data-testid="overlay-backdrop" />
      {view.kind === 'commandBar' && <CommandBar payload={view.payload as CommandBarPayload} />}
      {view.kind === 'switcher' && <Switcher payload={view.payload as SwitcherPayload} />}
      {view.kind === 'spaceEditor' && (
        <SpaceEditor key={JSON.stringify(view.payload)} payload={view.payload as SpaceEditorPayload} />
      )}
      {view.kind === 'peek' && <PeekChrome />}
      {view.kind === 'permissionPrompt' && (
        <PermissionPromptView initial={view.payload as PermissionPrompt} />
      )}
      {view.kind === 'updateNotes' && <UpdateNotes payload={view.payload as UpdateNotesPayload} />}
      {view.kind === 'sidebar' && (
        <div
          className={styles.floatingSidebar}
          onMouseLeave={() => {
            leaveTimer.current = setTimeout(hide, 180);
          }}
          onMouseEnter={() => {
            if (leaveTimer.current) clearTimeout(leaveTimer.current);
            leaveTimer.current = null;
          }}
        >
          <Sidebar width={sidebarWidth} onToggle={hide} floating />
        </div>
      )}
    </div>
  );
}
