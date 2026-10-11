import { invoke } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { useShell } from '../../lib/store';
import { Icon } from '../Icon';
import styles from './SpaceHeader.module.css';

/** Emoji and name of the current Space, right under the favorites (where Arc shows it). */
export function SpaceHeader() {
  const core = useShell((s) => s.core);
  const t = useT();
  const space = core.spaces[core.activeSpaceId];
  if (!space) return null;
  const isPrivate = !!core.profiles[space.profileId ?? '']?.ephemeral;
  return (
    <button
      className={styles.header}
      onClick={() => void invoke('overlay/show', { kind: 'spaceEditor', payload: { spaceId: space.id } })}
      onContextMenu={(e) => {
        e.preventDefault();
        void invoke('menu/show', { kind: 'space', id: space.id });
      }}
      aria-label={
        isPrivate
          ? t('shell.spaceBar.editSpacePrivate', { name: space.name })
          : t('shell.spaceBar.editSpace', { name: space.name })
      }
      title={isPrivate ? t('shell.spaceBar.privateHint') : undefined}
      data-testid="space-name"
      data-private={isPrivate ? 'true' : undefined}
    >
      <span className={styles.emoji} aria-hidden="true">
        {space.emoji}
      </span>
      <span className={styles.name}>{space.name}</span>
      {isPrivate && <Icon name="eye" size={12} className={styles.privateMark} />}
    </button>
  );
}
