import { activeItemId, pinnedTree, type Container, type Folder, type Id } from '@vela/core';
import { useMemo, type PointerEvent } from 'react';
import { dispatch, invoke } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { useShell } from '../../lib/store';
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

/** Arc-like folder: a filled folder that opens (flap tilted) when expanded, no chevron. */
function FolderGlyph({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      className={styles.glyph}
      data-open={open ? 'true' : 'false'}
    >
      <path className={styles.glyphBack} d="M3 7a2 2 0 0 1 2-2h4.5l2 2H19a2 2 0 0 1 2 2v2H3z" />
      {open ? (
        <path
          className={styles.glyphFront}
          d="M2.5 11.5h19.2a1 1 0 0 1 1 1.2l-1.4 6.3A2 2 0 0 1 19.3 20H4.8a2 2 0 0 1-2-1.7L2 12.6a1 1 0 0 1 .5-1.1z"
        />
      ) : (
        <path className={styles.glyphFront} d="M3 10h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      )}
    </svg>
  );
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
      <span className={styles.folderIcon} aria-hidden="true">
        {folder.emoji ?? <FolderGlyph open={!folder.collapsed} />}
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
  const t = useT();
  const space = core.spaces[core.activeSpaceId];
  const items = space ? pinnedTree(core, space.id) : [];
  const listRef = useFlip<HTMLDivElement>(
    items.map((it) => (it.kind === 'folder' ? it.folder.id : it.tab.id)).join(','),
  );
  // Container objects are derived once per folder set so memo(TabRow) sees stable props on every tick.
  const spaceId = space?.id ?? '';
  const containers = useMemo(() => {
    const m = new Map<string, Container>();
    for (const f of Object.values(core.folders)) m.set(f.id, { kind: 'folder', folderId: f.id });
    m.set('pinned', { kind: 'pinned', spaceId });
    return m;
  }, [core.folders, spaceId]);
  if (!space) return null;
  const parentOf = new Map<Id, Id>();
  for (const f of Object.values(core.folders)) for (const c of f.children) parentOf.set(c, f.id);
  const containerFor = (id: Id): { container: Container; index: number } => {
    const p = parentOf.get(id);
    if (p)
      return {
        container: containers.get(p) ?? { kind: 'folder', folderId: p },
        index: core.folders[p]?.children.indexOf(id) ?? 0,
      };
    return {
      container: containers.get('pinned') ?? { kind: 'pinned', spaceId: space.id },
      index: space.pinned.indexOf(id),
    };
  };
  return (
    <div
      role="group"
      aria-label={t('shell.pinnedList.label')}
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
            active={activeItemId(core) === it.tab.id}
            inSplit={!!space.split?.panes.includes(it.tab.id)}
            {...containerFor(it.tab.id)}
            onDragStart={onDragStart}
          />
        ),
      )}
    </div>
  );
}
