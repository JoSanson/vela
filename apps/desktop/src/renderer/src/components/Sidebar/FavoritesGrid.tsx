import { activeItemId, displayTitle, favoriteTabs } from '@vela/core';
import { useState, type PointerEvent } from 'react';
import { dispatch, invoke } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { useShell } from '../../lib/store';
import { Favicon } from '../Favicon';
import { Icon } from '../Icon';
import type { DragItem } from './dnd';
import styles from './FavoritesGrid.module.css';

interface Props {
  onDragStart: (e: PointerEvent<HTMLElement>, item: DragItem) => void;
  dragging: boolean;
}

/** Three rows of four; beyond that a "+N" tile unfolds the rest (dragging always shows all). */
const MAX_VISIBLE = 12;

export function FavoritesGrid({ onDragStart, dragging }: Props) {
  const core = useShell((s) => s.core);
  const t = useT();
  const all = favoriteTabs(core);
  const [expanded, setExpanded] = useState(false);
  const activeId = activeItemId(core);
  if (all.length === 0 && !dragging) return null;
  const folded = all.length > MAX_VISIBLE && !expanded && !dragging;
  const favs = folded ? all.slice(0, MAX_VISIBLE - 1) : all;
  const hidden = all.length - favs.length;
  const grid = (
    <div
      className={`${styles.grid} ${favs.length === 0 ? styles.emptyZone : ''}`}
      role="list"
      aria-label={t('shell.favorites.label')}
      data-testid="favorites"
      data-dnd-zone="favorites"
      data-dnd-count={all.length}
    >
      {favs.map((t, i) => (
        <button
          key={t.id}
          role="listitem"
          className={`${styles.cell} ${t.id === activeId ? styles.active : ''}`}
          onClick={(e) => {
            // ⌘-click keeps the favorite where it is and opens its page as a Today tab (Arc).
            if (e.metaKey || e.ctrlKey) {
              void invoke('tab/openUrl', {
                input: t.url,
                spaceId: core.activeSpaceId,
                activate: !e.shiftKey,
                noAtc: true,
              });
              return;
            }
            dispatch({ type: 'tab/activate', id: t.id, now: Date.now(), spaceId: core.activeSpaceId });
          }}
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
          data-loaded={t.loaded}
        >
          <Favicon tab={t} size={20} />
          {t.audible && <span className={styles.dot} aria-hidden="true" />}
          <span className={`${styles.live} ${t.loaded ? styles.on : ''}`} aria-hidden="true" />
        </button>
      ))}
      {(folded || (expanded && all.length > MAX_VISIBLE && !dragging)) && (
        <button
          className={`${styles.cell} ${styles.more}`}
          onClick={() => setExpanded(!expanded)}
          aria-label={folded ? t('shell.favorites.showMore', { n: hidden }) : t('shell.favorites.showLess')}
          title={folded ? t('shell.favorites.showMore', { n: hidden }) : t('shell.favorites.showLess')}
          data-testid="favorites-more"
        >
          {folded ? `+${hidden}` : <Icon name="chevron" size={14} className={styles.up} />}
        </button>
      )}
      {all.length === 0 && <span className={styles.hint}>{t('shell.favorites.dropHint')}</span>}
    </div>
  );
  // The empty drop zone floats over the tabs from where the grid would be, so it never shifts them.
  return favs.length === 0 ? <div className={styles.anchor}>{grid}</div> : grid;
}
