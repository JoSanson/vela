import { pinnedTree, type Container, type Folder, type Id } from '@vela/core';
import type { PointerEvent } from 'react';
import { dispatch, invoke } from '../../lib/api';
import { useShell } from '../../lib/store';
import { Icon } from '../Icon';
import { InlineEdit } from '../InlineEdit';
import { useFlip } from '../useFlip';
import type { DragItem } from './dnd';
import { TabRow } from './TabRow';
import styles from './PinnedList.module.css';

interface RowProps {
  folder: Folder;
  depth: number;
  container: Container;
  index: number;
  onDragStart: (e: PointerEvent<HTMLElement>, item: DragItem) => void;
}

function FolderRow({ folder, depth, container, index, onDragStart }: RowProps) {
  const editing = useShell((s) => s.editingItemId === folder.id);
  const setEditing = useShell((s) => s.setEditingItem);
  const toggle = (): void =>
    dispatch({ type: 'folder/update', id: folder.id, patch: { collapsed: !folder.collapsed } });
  return (
    <div
      role="treeitem"
      aria-expanded={!folder.collapsed}
      aria-level={depth + 1}
      tabIndex={-1}
      className={styles.folder}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={toggle}
      onDoubleClick={() => setEditing(folder.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        void invoke('menu/show', { kind: 'folder', id: folder.id });
      }}
      onPointerDown={(e) =>
        onDragStart(e, {
          id: folder.id,
          type: 'folder',
          label: folder.name,
          emoji: folder.emoji,
          favicon: null,
          url: '',
        })
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') toggle();
        if (e.key === 'F2') setEditing(folder.id);
      }}
      data-folder-id={folder.id}
      data-flip-key={folder.id}
      data-dnd-row={folder.id}
      data-dnd-type="folder"
      data-dnd-container={JSON.stringify(container)}
      data-dnd-index={index}
      data-dnd-depth={depth}
    >
      <Icon name="chevron" size={12} className={`${styles.chevron} ${folder.collapsed ? '' : styles.open}`} />
      <span className={styles.folderIcon} aria-hidden="true">
        {folder.emoji ?? <Icon name="folder" size={14} />}
      </span>
      {editing ? (
        <InlineEdit
          value={folder.name}
          onCommit={(v) => {
            if (v.trim()) dispatch({ type: 'folder/update', id: folder.id, patch: { name: v.trim() } });
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <span className={styles.name}>{folder.name}</span>
      )}
    </div>
  );
}

interface Props {
  onDragStart: (e: PointerEvent<HTMLElement>, item: DragItem) => void;
}

export function PinnedList({ onDragStart }: Props) {
  const core = useShell((s) => s.core);
  const space = core.spaces[core.activeSpaceId];
  const items = space ? pinnedTree(core, space.id) : [];
  const listRef = useFlip<HTMLDivElement>(
    items.map((it) => (it.kind === 'folder' ? it.folder.id : it.tab.id)).join(','),
  );
  if (!space) return null;
  const parentOf = new Map<Id, Id>();
  for (const f of Object.values(core.folders)) for (const c of f.children) parentOf.set(c, f.id);
  const containerFor = (id: Id): { container: Container; index: number } => {
    const p = parentOf.get(id);
    if (p)
      return {
        container: { kind: 'folder', folderId: p },
        index: core.folders[p]?.children.indexOf(id) ?? 0,
      };
    return { container: { kind: 'pinned', spaceId: space.id }, index: space.pinned.indexOf(id) };
  };
  return (
    <div
      role="group"
      aria-label="Pinned tabs"
      ref={listRef}
      className={`${styles.list} ${items.length === 0 ? styles.empty : ''}`}
      data-testid="pinned"
      data-dnd-zone="pinned"
      data-dnd-container={JSON.stringify({ kind: 'pinned', spaceId: space.id })}
      data-dnd-count={space.pinned.length}
      onContextMenu={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          void invoke('menu/show', { kind: 'pinnedArea' });
        }
      }}
    >
      {items.map((it) =>
        it.kind === 'folder' ? (
          <FolderRow
            key={it.folder.id}
            folder={it.folder}
            depth={it.depth}
            {...containerFor(it.folder.id)}
            onDragStart={onDragStart}
          />
        ) : (
          <TabRow
            key={it.tab.id}
            tab={it.tab}
            depth={it.depth}
            active={space.activeTabId === it.tab.id}
            inSplit={!!space.split?.panes.includes(it.tab.id)}
            {...containerFor(it.tab.id)}
            onDragStart={onDragStart}
          />
        ),
      )}
    </div>
  );
}
