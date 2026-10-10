import { displayTitle, type Tab } from '@vela/core';
import { memo, useCallback, type KeyboardEvent, type MouseEvent } from 'react';
import { dispatch, invoke } from '../../lib/api';
import { Favicon } from '../Favicon';
import { Icon } from '../Icon';
import styles from './TabRow.module.css';

interface Props {
  tab: Tab;
  active: boolean;
  depth?: number;
  inSplit?: boolean;
}

export const TabRow = memo(function TabRow({ tab, active, depth = 0, inSplit = false }: Props) {
  const title = displayTitle(tab);
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
      }
    },
    [activate, close],
  );
  const toggleMute = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      void invoke('tab/setMuted', { tabId: tab.id, muted: !tab.muted });
    },
    [tab.id, tab.muted],
  );

  return (
    <div
      role="treeitem"
      aria-selected={active}
      aria-level={depth + 1}
      tabIndex={active ? 0 : -1}
      data-tab-id={tab.id}
      data-kind={tab.kind}
      className={`${styles.row} ${active ? styles.active : ''} ${inSplit ? styles.inSplit : ''} ${tab.sleeping ? styles.sleeping : ''}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={activate}
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
      title={tab.url}
    >
      <Favicon tab={tab} />
      <span className={styles.title}>{title}</span>
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
      <button className={styles.close} onClick={close} aria-label={`Close ${title}`} tabIndex={-1}>
        <Icon name="close" size={13} />
      </button>
    </div>
  );
});
