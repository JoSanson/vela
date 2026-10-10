import { displayTitle, favoriteTabs } from '@vela/core';
import { dispatch } from '../../lib/api';
import { useShell } from '../../lib/store';
import { Favicon } from '../Favicon';
import styles from './FavoritesGrid.module.css';

export function FavoritesGrid() {
  const core = useShell((s) => s.core);
  const favs = favoriteTabs(core);
  const activeId = core.spaces[core.activeSpaceId]?.activeTabId;
  if (favs.length === 0) return null;
  return (
    <div className={styles.grid} role="list" aria-label="Favorites" data-testid="favorites">
      {favs.map((t) => (
        <button
          key={t.id}
          role="listitem"
          className={`${styles.cell} ${t.id === activeId ? styles.active : ''}`}
          onClick={() => dispatch({ type: 'tab/activate', id: t.id, now: Date.now() })}
          title={displayTitle(t)}
          aria-label={displayTitle(t)}
          data-tab-id={t.id}
        >
          <Favicon tab={t} size={20} />
        </button>
      ))}
    </div>
  );
}
