import { pinnedTree, type Folder } from '@vela/core';
import { dispatch } from '../../lib/api';
import { useShell } from '../../lib/store';
import { Icon } from '../Icon';
import { TabRow } from './TabRow';
import styles from './PinnedList.module.css';

function FolderRow({ folder, depth }: { folder: Folder; depth: number }) {
  return (
    <div
      role="treeitem"
      aria-expanded={!folder.collapsed}
      aria-level={depth + 1}
      tabIndex={-1}
      className={styles.folder}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={() =>
        dispatch({ type: 'folder/update', id: folder.id, patch: { collapsed: !folder.collapsed } })
      }
      data-folder-id={folder.id}
    >
      <Icon name="chevron" size={12} className={`${styles.chevron} ${folder.collapsed ? '' : styles.open}`} />
      <span className={styles.folderIcon} aria-hidden="true">
        {folder.emoji ?? <Icon name="folder" size={14} />}
      </span>
      <span className={styles.name}>{folder.name}</span>
    </div>
  );
}

export function PinnedList() {
  const core = useShell((s) => s.core);
  const space = core.spaces[core.activeSpaceId];
  if (!space) return null;
  const items = pinnedTree(core, space.id);
  if (items.length === 0) return null;
  return (
    <div role="group" aria-label="Pinned tabs" className={styles.list} data-testid="pinned">
      {items.map((it) =>
        it.kind === 'folder' ? (
          <FolderRow key={it.folder.id} folder={it.folder} depth={it.depth} />
        ) : (
          <TabRow
            key={it.tab.id}
            tab={it.tab}
            depth={it.depth}
            active={space.activeTabId === it.tab.id}
            inSplit={!!space.split?.panes.includes(it.tab.id)}
          />
        ),
      )}
    </div>
  );
}
