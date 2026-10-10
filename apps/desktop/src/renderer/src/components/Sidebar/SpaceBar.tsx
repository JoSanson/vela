import { dispatch, invoke } from '../../lib/api';
import { useShell } from '../../lib/store';
import { Icon } from '../Icon';
import styles from './SpaceBar.module.css';

export function SpaceBar() {
  const core = useShell((s) => s.core);
  const setDownloadsOpen = useShell((s) => s.setDownloadsOpen);
  const downloadsOpen = useShell((s) => s.downloadsOpen);
  const active = core.spaces[core.activeSpaceId];
  const editSpace = (id: string): void =>
    void invoke('overlay/show', { kind: 'spaceEditor', payload: { spaceId: id } });
  return (
    <div className={styles.bar}>
      <button
        className={styles.name}
        onClick={() => editSpace(core.activeSpaceId)}
        onContextMenu={(e) => {
          e.preventDefault();
          void invoke('menu/show', { kind: 'space', id: core.activeSpaceId });
        }}
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
              style={{ '--dot-color': sp.theme.from } as React.CSSProperties}
              onClick={() => dispatch({ type: 'space/activate', id, now: Date.now() })}
              onContextMenu={(e) => {
                e.preventDefault();
                void invoke('menu/show', { kind: 'space', id });
              }}
              data-space-id={id}
              data-dnd-space={id}
            >
              {isActive ? <span aria-hidden="true">{sp.emoji}</span> : null}
            </button>
          );
        })}
        <button
          className={styles.add}
          aria-label="New space"
          title="New space (⌘⇧N)"
          onClick={() => editSpace('new')}
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
          data-testid="downloads-toggle"
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
