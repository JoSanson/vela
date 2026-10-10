import { useEffect } from 'react';
import { Sidebar } from '../components/Sidebar/Sidebar';
import { invoke, vela } from '../lib/api';
import { connectStore, useShell } from '../lib/store';
import { applyTheme, systemPrefersDark } from '../lib/theme';
import { CommandBar, type CommandBarPayload } from './CommandBar';
import styles from './OverlayApp.module.css';

export function OverlayApp() {
  const overlay = useShell((s) => s.overlay);
  const core = useShell((s) => s.core);
  const sidebarWidth = useShell((s) => s.sidebarWidth);

  useEffect(() => connectStore(), []);

  const theme = core.spaces[core.activeSpaceId]?.theme;
  useEffect(() => {
    if (theme) applyTheme(theme, systemPrefersDark());
  }, [theme]);

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

  if (overlay.kind === 'none') return <div className={styles.root} data-kind="none" />;

  return (
    <div className={styles.root} data-kind={overlay.kind} data-testid="overlay">
      <div className={styles.backdrop} onMouseDown={hide} data-testid="overlay-backdrop" />
      {overlay.kind === 'commandBar' && <CommandBar payload={overlay.payload as CommandBarPayload} />}
      {overlay.kind === 'sidebar' && (
        <div className={styles.floatingSidebar} onMouseLeave={hide}>
          <Sidebar width={sidebarWidth} onToggle={hide} floating />
        </div>
      )}
    </div>
  );
}
