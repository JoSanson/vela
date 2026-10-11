import { useT } from '../../lib/i18n';
import { Favicon } from '../Favicon';
import { Icon } from '../Icon';
import type { DndState } from './dnd';
import styles from './DndLayer.module.css';

export function DndLayer({ dnd }: { dnd: DndState | null }) {
  const tr = useT();
  if (!dnd) return null;
  const t = dnd.target;
  return (
    <>
      <div
        className={styles.ghost}
        style={{ transform: `translate(${dnd.x + 12}px, ${dnd.y - 14}px)` }}
        aria-hidden="true"
      >
        {dnd.item.type === 'folder' ? (
          <Icon name="folder" size={14} />
        ) : (
          <Favicon
            tab={{
              favicon: dnd.item.favicon,
              emoji: dnd.item.emoji,
              url: dnd.item.url,
              sleeping: false,
              loading: false,
            }}
            size={14}
          />
        )}
        <span>{dnd.item.label}</span>
      </div>
      {t?.kind === 'line' && (
        <div
          className={styles.line}
          style={{
            transform: `translate(${t.x + t.depth * 14}px, ${t.y - 1}px)`,
            width: t.width - t.depth * 14,
          }}
        />
      )}
      {t?.kind === 'pair' && (
        <div
          className={styles.into}
          style={{
            transform: `translate(${t.rect.left}px, ${t.rect.top}px)`,
            width: t.rect.width,
            height: t.rect.height,
          }}
          aria-label={tr('shell.dnd.openInSplit')}
        />
      )}
      {t?.kind === 'into' && (
        <div
          className={styles.into}
          style={{
            transform: `translate(${t.rect.left}px, ${t.rect.top}px)`,
            width: t.rect.width,
            height: t.rect.height,
          }}
        />
      )}
      {t?.kind === 'favorites' && (
        <div
          className={styles.vline}
          style={{ transform: `translate(${t.x}px, ${t.y}px)`, height: t.height }}
        />
      )}
      {t?.kind === 'space' && (
        <div
          className={styles.into}
          style={{
            transform: `translate(${t.rect.left - 4}px, ${t.rect.top - 4}px)`,
            width: t.rect.width + 8,
            height: t.rect.height + 8,
            borderRadius: 999,
          }}
        />
      )}
      {t?.kind === 'split' && (
        <div
          className={styles.split}
          style={{
            transform: `translate(${t.side === 'left' ? t.rect.left : t.rect.left + t.rect.width / 2}px, ${t.rect.top}px)`,
            width: t.rect.width / 2,
            height: t.rect.height,
          }}
        >
          <span>{tr('shell.dnd.openInSplit')}</span>
        </div>
      )}
    </>
  );
}
