import { displayTitle, type Container, type Tab } from '@vela/core';
import { memo, useCallback, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { dispatch, invoke } from '../../lib/api';
import { useShell } from '../../lib/store';
import { Favicon } from '../Favicon';
import { Icon } from '../Icon';
import { InlineEdit } from '../InlineEdit';
import type { DragItem } from './dnd';
import styles from './TabRow.module.css';

interface Props {
  tab: Tab;
  active: boolean;
  depth?: number;
  inSplit?: boolean;
  container: Container;
  index: number;
  onDragStart?: (e: PointerEvent<HTMLElement>, item: DragItem) => void;
}

export const TabRow = memo(function TabRow({
  tab,
  active,
  depth = 0,
  inSplit = false,
  container,
  index,
  onDragStart,
}: Props) {
  const title = displayTitle(tab);
  const editing = useShell((s) => s.editingItemId === tab.id);
  const setEditing = useShell((s) => s.setEditingItem);
  const activate = useCallback(
    () => dispatch({ type: 'tab/activate', id: tab.id, now: Date.now() }),
    [tab.id],
  );
  const close = useCallback(
    (e: MouseEvent | KeyboardEvent) => {
      e.stopPropagation();
      void invoke('tab/close', { tabId: tab.id });
    },
    [tab.id],
  );
  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        void invoke('tab/close', { tabId: tab.id });
      }
    },
    [tab.id],
  );
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        close(e);
      } else if (e.key === 'F2') {
        e.preventDefault();
        setEditing(tab.id);
      }
    },
    [activate, close, setEditing, tab.id],
  );
  const toggleMute = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      void invoke('tab/setMuted', { tabId: tab.id, muted: !tab.muted });
    },
    [tab.id, tab.muted],
  );
  const onContextMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      void invoke('menu/show', { kind: tab.kind === 'favorite' ? 'favorite' : 'tab', id: tab.id });
    },
    [tab.id, tab.kind],
  );
  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      onDragStart?.(e, {
        id: tab.id,
        type: 'tab',
        label: title,
        emoji: tab.emoji,
        favicon: tab.favicon,
        url: tab.url,
      });
    },
    [onDragStart, tab.id, tab.emoji, tab.favicon, tab.url, title],
  );
  const commitRename = useCallback(
    (value: string) => {
      const v = value.trim();
      dispatch({ type: 'tab/update', id: tab.id, patch: { customTitle: v && v !== tab.title ? v : null } });
      setEditing(null);
    },
    [tab.id, tab.title, setEditing],
  );

  return (
    <div
      role="treeitem"
      aria-selected={active}
      aria-level={depth + 1}
      tabIndex={active ? 0 : -1}
      data-tab-id={tab.id}
      data-kind={tab.kind}
      data-dnd-row={tab.id}
      data-dnd-type="tab"
      data-dnd-container={JSON.stringify(container)}
      data-dnd-index={index}
      data-dnd-depth={depth}
      className={`${styles.row} ${active ? styles.active : ''} ${inSplit ? styles.inSplit : ''} ${tab.sleeping ? styles.sleeping : ''}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={activate}
      onDoubleClick={() => setEditing(tab.id)}
      onMouseDown={onMouseDown}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
      title={tab.url}
    >
      <Favicon tab={tab} />
      {editing ? (
        <InlineEdit
          value={tab.customTitle ?? tab.title}
          onCommit={commitRename}
          onCancel={() => setEditing(null)}
          placeholder={tab.title}
        />
      ) : (
        <span className={styles.title}>{title}</span>
      )}
      {tab.loading && <span className={styles.spinner} aria-label="Loading" />}
      {(tab.audible || tab.muted) && (
        <button
          className={styles.audio}
          onClick={toggleMute}
          aria-label={tab.muted ? 'Unmute tab' : 'Mute tab'}
        >
          <Icon name={tab.muted ? 'mute' : 'audio'} size={13} />
        </button>
      )}
      {tab.sleeping && <Icon name="sleep" size={12} className={styles.sleepIcon} />}
      {!editing && (
        <button className={styles.close} onClick={close} aria-label={`Close ${title}`} tabIndex={-1}>
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  );
});
