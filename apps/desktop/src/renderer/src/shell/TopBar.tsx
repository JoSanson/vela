import { topBarHeight } from '@vela/shared';
import { invoke, vela } from '../lib/api';
import { useShell } from '../lib/store';
import styles from './TopBar.module.css';

/**
 * Windows/Linux only: a draggable strip above the content (macOS uses the hidden-inset title bar
 * with traffic lights inside the sidebar). The native window controls are drawn by Chromium's
 * title bar overlay in the top-right corner; its colours follow the space theme (see main).
 */
export function TopBar() {
  const core = useShell((s) => s.core);
  const height = topBarHeight(vela.platform);
  if (height === 0) return null;
  const space = core.spaces[core.activeSpaceId];
  return (
    <div className={`${styles.bar} drag`} style={{ height }} data-testid="top-bar">
      <span className={styles.title}>
        {space?.emoji} {space?.name}
      </span>
      <button
        className={`${styles.btn} no-drag`}
        onClick={() => void invoke('tab/openUrl', { input: 'vela://shortcuts', noAtc: true })}
        aria-label="Keyboard shortcuts"
      >
        ?
      </button>
      <span className={styles.controlsGap} aria-hidden="true" />
    </div>
  );
}
