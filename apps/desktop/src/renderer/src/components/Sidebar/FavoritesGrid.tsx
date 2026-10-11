import { displayTitle, favoriteTabs } from '@vela/core';
import type { PointerEvent } from 'react';
import { dispatch, invoke } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { useShell } from '../../lib/store';
import { Favicon } from '../Favicon';
import type { DragItem } from './dnd';
import styles from './FavoritesGrid.module.css';

interface Props {
  onDragStart: (e: PointerEvent<HTMLElement>, item: DragItem) => void;
  dragging: boolean;
}

export function FavoritesGrid({ onDragStart, dragging }: Props) {
  const core = useShell((s) => s.core);
  const t = useT();
  const favs = favoriteTabs(core);
  const activeId = core.spaces[core.activeSpaceId]?.activeTabId;
  if (favs.length === 0 && !dragging) return null;
  return (
    <div
      className={`${styles.grid} ${favs.length === 0 ? styles.emptyZone : ''}`}
      role="list"
      aria-label={t('shell.favorites.label')}
      data-testid="favorites"
      data-dnd-zone="favorites"
      data-dnd-count={favs.length}
    >
      {favs.map((t, i) => (
        <button
          key={t.id}
          role="listitem"
          className={`${styles.cell} ${t.id === activeId ? styles.active : ''}`}
          onClick={() => dispatch({ type: 'tab/activate', id: t.id, now: Date.now() })}
          onContextMenu={(e) => {
            e.preventDefault();
            void invoke('menu/show', { kind: 'favorite', id: t.id });
          }}
          onPointerDown={(e) =>
            onDragStart(e, {
              id: t.id,
              type: 'tab',
              label: displayTitle(t),
              emoji: t.emoji,
              favicon: t.favicon,
              url: t.url,
            })
          }
          title={displayTitle(t)}
          aria-label={displayTitle(t)}
          data-tab-id={t.id}
          data-dnd-fav={i}
        >
          <Favicon tab={t} size={20} />
          {t.audible && <span className={styles.dot} aria-hidden="true" />}
        </button>
      ))}
      {favs.length === 0 && <span className={styles.hint}>{t('shell.favorites.dropHint')}</span>}
    </div>
  );
}
