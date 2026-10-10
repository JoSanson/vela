import { todayTabs } from '@vela/core';
import { useMemo, type PointerEvent } from 'react';
import { dispatch, invoke, modKey } from '../../lib/api';
import { useShell } from '../../lib/store';
import { Icon } from '../Icon';
import { useFlip } from '../useFlip';
import type { DragItem } from './dnd';
import { TabRow } from './TabRow';
import styles from './TodayList.module.css';

interface Props {
  onDragStart: (e: PointerEvent<HTMLElement>, item: DragItem) => void;
}

export function TodayList({ onDragStart }: Props) {
  const core = useShell((s) => s.core);
  const space = core.spaces[core.activeSpaceId];
  const listRef = useFlip<HTMLDivElement>(space?.today.join(',') ?? '');
  const spaceId = space?.id ?? '';
  const container = useMemo(() => ({ kind: 'today' as const, spaceId }), [spaceId]);
  if (!space) return null;
  const tabs = todayTabs(core, space.id);
  const hasPinned = space.pinned.length > 0;
  const clearAll = (): void => {
    const closed = tabs.map((t) => ({
      ...t,
      loaded: false,
      loading: false,
      audible: false,
      sleeping: false,
    }));
    const wasActive = space.activeTabId;
    for (const t of tabs) void invoke('tab/close', { tabId: t.id });
    useShell.getState().showToast({
      text: `Closed ${closed.length} tab${closed.length > 1 ? 's' : ''}`,
      action: {
        label: 'Undo',
        run: () => {
          // Re-open the very same tabs (internal pages included), in their original order.
          for (const t of [...closed].reverse()) dispatch({ type: 'tab/open', tab: t, activate: false });
          if (wasActive) dispatch({ type: 'tab/activate', id: wasActive, now: Date.now() });
        },
      },
    });
  };
  return (
    <div
      role="group"
      aria-label="Today"
      className={styles.wrap}
      data-testid="today"
      data-dnd-zone="today"
      data-dnd-container={JSON.stringify({ kind: 'today', spaceId: space.id })}
      data-dnd-count={space.today.length}
      onContextMenu={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          void invoke('menu/show', { kind: 'today' });
        }
      }}
    >
      {hasPinned && (
        <div className={styles.divider}>
          <span className={styles.line} />
          {tabs.length > 0 && (
            <button className={styles.clear} onClick={clearAll} data-testid="clear-today">
              Clear
            </button>
          )}
        </div>
      )}
      <button
        className={styles.newTab}
        onClick={() => void invoke('overlay/show', { kind: 'commandBar', payload: { mode: 'new' } })}
        data-testid="new-tab"
      >
        <Icon name="plus" size={15} />
        <span>New tab</span>
        <kbd className={styles.kbd}>{modKey}T</kbd>
      </button>
      <div className={styles.list} ref={listRef}>
        {tabs.map((t, i) => (
          <TabRow
            key={t.id}
            tab={t}
            active={space.activeTabId === t.id}
            inSplit={!!space.split?.panes.includes(t.id)}
            container={container}
            index={i}
            onDragStart={onDragStart}
          />
        ))}
      </div>
      {tabs.length === 0 && !hasPinned && core.favorites.length === 0 && (
        <p className={styles.emptyHint}>
          Tabs you open land here. They are archived after{' '}
          <span className={styles.nowrap}>{useShell.getState().prefs.autoArchiveHours}h</span> of inactivity.
        </p>
      )}
    </div>
  );
}
