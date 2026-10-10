import { todayTabs } from '@vela/core';
import { invoke, modKey } from '../../lib/api';
import { useShell } from '../../lib/store';
import { Icon } from '../Icon';
import { TabRow } from './TabRow';
import styles from './TodayList.module.css';

export function TodayList() {
  const core = useShell((s) => s.core);
  const space = core.spaces[core.activeSpaceId];
  if (!space) return null;
  const tabs = todayTabs(core, space.id);
  const hasPinned = space.pinned.length > 0;
  const clearAll = (): void => {
    for (const t of tabs) void invoke('tab/close', { tabId: t.id });
  };
  return (
    <div role="group" aria-label="Today" className={styles.wrap} data-testid="today">
      {hasPinned && (
        <div className={styles.divider}>
          <span className={styles.line} />
          {tabs.length > 0 && (
            <button className={styles.clear} onClick={clearAll}>
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
      <div className={styles.list}>
        {tabs.map((t) => (
          <TabRow
            key={t.id}
            tab={t}
            active={space.activeTabId === t.id}
            inSplit={!!space.split?.panes.includes(t.id)}
          />
        ))}
      </div>
    </div>
  );
}
