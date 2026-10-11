import { todayTabs, favoriteTabs } from '@vela/core';
import { useMemo, type PointerEvent } from 'react';
import { dispatch, invoke, modKey } from '../../lib/api';
import { useT } from '../../lib/i18n';
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
  const t = useT();
  const space = core.spaces[core.activeSpaceId];
  const listRef = useFlip<HTMLDivElement>(space?.today.join(',') ?? '');
  const spaceId = space?.id ?? '';
  const container = useMemo(() => ({ kind: 'today' as const, spaceId }), [spaceId]);
  if (!space) return null;
  const tabs = todayTabs(core, space.id);
  const hasPinned = space.pinned.length > 0;
  const clearAll = (): void => {
    const closed = tabs.map((tab) => ({
      ...tab,
      loaded: false,
      loading: false,
      audible: false,
      sleeping: false,
    }));
    const wasActive = space.activeTabId;
    for (const tab of tabs) void invoke('tab/close', { tabId: tab.id });
    useShell.getState().showToast({
      text: t('shell.today.closedTabs', { n: closed.length }),
      action: {
        label: t('shell.today.undo'),
        run: () => {
          // Re-open the very same tabs (internal pages included), in their original order.
          for (const tab of [...closed].reverse()) dispatch({ type: 'tab/open', tab, activate: false });
          if (wasActive) dispatch({ type: 'tab/activate', id: wasActive, now: Date.now() });
        },
      },
    });
  };
  const [hintBefore, hintAfter] = t('shell.today.emptyHint', { hours: '\u0000' }).split('\u0000');
  return (
    <div
      role="group"
      aria-label={t('shell.today.label')}
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
              {t('shell.today.clear')}
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
        <span>{t('shell.today.newTab')}</span>
        <kbd className={styles.kbd}>{modKey}T</kbd>
      </button>
      <div className={styles.list} ref={listRef}>
        {tabs.map((tab, i) => (
          <TabRow
            key={tab.id}
            tab={tab}
            active={space.activeTabId === tab.id}
            inSplit={!!space.split?.panes.includes(tab.id)}
            container={container}
            index={i}
            onDragStart={onDragStart}
          />
        ))}
      </div>
      {tabs.length === 0 && !hasPinned && favoriteTabs(core, space.id).length === 0 && (
        <p className={styles.emptyHint}>
          {hintBefore}
          <span className={styles.nowrap}>
            {t('shell.today.hours', { n: useShell.getState().prefs.autoArchiveHours })}
          </span>
          {hintAfter}
        </p>
      )}
    </div>
  );
}
