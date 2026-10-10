import { dispatch, invoke } from '../../lib/api';
import { useShell } from '../../lib/store';
import { Icon } from '../Icon';
import styles from './SpaceBar.module.css';

export function SpaceBar() {
  const core = useShell((s) => s.core);
  const setEditing = useShell((s) => s.setEditingSpace);
  const setDownloadsOpen = useShell((s) => s.setDownloadsOpen);
  const downloadsOpen = useShell((s) => s.downloadsOpen);
  const active = core.spaces[core.activeSpaceId];
  return (
    <div className={styles.bar}>
      <button
        className={styles.name}
        onClick={() => setEditing(core.activeSpaceId)}
        aria-label={`Edit space ${active?.name ?? ''}`}
        data-testid="space-name"
      >
        <span aria-hidden="true">{active?.emoji}</span>
        <span className={styles.label}>{active?.name}</span>
      </button>
      <div className={styles.dots} role="tablist" aria-label="Spaces">
        {core.spaceOrder.map((id, i) => {
          const sp = core.spaces[id];
          if (!sp) return null;
          const isActive = id === core.activeSpaceId;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={isActive}
              aria-label={`${sp.name} (Ctrl+${i + 1})`}
              title={sp.name}
              className={`${styles.dot} ${isActive ? styles.dotActive : ''}`}
              onClick={() => dispatch({ type: 'space/activate', id, now: Date.now() })}
              data-space-id={id}
            >
              {isActive ? <span aria-hidden="true">{sp.emoji}</span> : null}
            </button>
          );
        })}
        <button
          className={styles.add}
          aria-label="New space"
          title="New space (⌘⇧N)"
          onClick={() =>
            void invoke('state/dispatch', {
              type: 'space/activate',
              id: core.activeSpaceId,
              now: Date.now(),
            }).then(() => setEditing('new'))
          }
          data-testid="new-space"
        >
          <Icon name="plus" size={13} />
        </button>
      </div>
      <div className={styles.actions}>
        <button
          className={`${styles.action} ${downloadsOpen ? styles.actionOn : ''}`}
          aria-label="Downloads"
          title="Downloads"
          onClick={() => setDownloadsOpen(!downloadsOpen)}
        >
          <Icon name="download" size={15} />
        </button>
        <button
          className={styles.action}
          aria-label="Settings"
          title="Settings"
          onClick={() => void invoke('tab/openUrl', { input: 'vela://settings', noAtc: true })}
        >
          <Icon name="settings" size={15} />
        </button>
      </div>
    </div>
  );
}
