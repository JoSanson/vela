import { createId, displayTitle, hostOf, type ArchivedTab } from '@vela/core';
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Favicon } from '../components/Favicon';
import { isMac, modKey } from '../lib/api';
import { now as nowMs, timeAgo, tryInvoke, useNow, useSnapshot } from './lib';
import { PageShell } from './PageShell';
import rows from './rows.module.css';
import { useToast } from './Toast';
import { Badge, Button, ConfirmButton, EmptyState, SearchBox } from './ui';
import { VirtualList } from './VirtualList';

const ROW_H = 56;
const LIMIT = 5000;

const REASON_LABEL: Record<ArchivedTab['reason'], string> = {
  auto: 'auto-archived',
  manual: 'archived',
  closed: 'closed',
};

export function ArchivePage() {
  const { toast } = useToast();
  const { snap, dispatch } = useSnapshot();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<ArchivedTab[] | null>(null);
  const [selected, setSelected] = useState(-1);
  const [reload, setReload] = useState(0);
  const now = useNow();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 150);
    return () => clearTimeout(t);
  }, [query]);

  // The broadcast state carries no archive: a change in the tab set is the refresh signal.
  const tabCount = snap ? Object.keys(snap.state.tabs).length : 0;
  useEffect(() => {
    let cancelled = false;
    void tryInvoke('archive/search', { query: debounced, limit: LIMIT }).then((res) => {
      if (cancelled) return;
      setItems([...(res ?? [])].sort((a, b) => b.archivedAt - a.archivedAt));
      setSelected(-1);
    });
    return () => {
      cancelled = true;
    };
  }, [debounced, reload, tabCount]);

  const list = useMemo(() => items ?? [], [items]);
  const rowHeight = useCallback(() => ROW_H, []);
  const rowKey = useCallback((t: ArchivedTab) => t.id, []);

  const restore = async (tab: ArchivedTab): Promise<void> => {
    const ok = await dispatch({ type: 'archive/restore', id: tab.id, newTabId: createId(), now: nowMs() });
    if (!ok) {
      toast("Couldn't restore this tab", 'error');
      return;
    }
    setItems((prev) => prev?.filter((t) => t.id !== tab.id) ?? prev);
    toast(`Restored “${displayTitle({ customTitle: null, title: tab.title, url: tab.url })}”`);
  };

  const remove = async (tab: ArchivedTab): Promise<void> => {
    const ok = await dispatch({ type: 'archive/remove', id: tab.id });
    if (!ok) {
      toast("Couldn't remove this tab", 'error');
      return;
    }
    setItems((prev) => prev?.filter((t) => t.id !== tab.id) ?? prev);
  };

  const clear = async (): Promise<void> => {
    const ok = await dispatch({ type: 'archive/clear' });
    if (!ok) {
      toast("Couldn't clear the archive", 'error');
      return;
    }
    setItems([]);
    setReload((n) => n + 1);
    toast('Archive cleared');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (list.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(list.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(-1, s - 1));
    } else if (e.key === 'Enter' && selected >= 0) {
      const t = list[selected];
      if (t) {
        e.preventDefault();
        void restore(t);
      }
    } else if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      (isMac ? e.metaKey : e.ctrlKey) &&
      selected >= 0
    ) {
      const t = list[selected];
      if (t) {
        e.preventDefault();
        void remove(t);
      }
    } else if (e.key === 'Escape') {
      setSelected(-1);
    }
  };

  const subtitle = items
    ? `${list.length} ${list.length === 1 ? 'tab' : 'tabs'}${debounced ? ' matching' : ''}`
    : 'Loading…';

  return (
    <PageShell
      title="Archive"
      icon="archive"
      subtitle={subtitle}
      testId="page-archive"
      fill
      actions={
        <ConfirmButton
          label="Clear archive"
          question="Remove every archived tab?"
          confirmLabel="Clear"
          icon="trash"
          testId="archive-clear"
          disabled={list.length === 0}
          onConfirm={() => void clear()}
        />
      }
      toolbar={
        <div style={{ flex: 1 }} onKeyDown={onKeyDown}>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search archived tabs"
            testId="archive-search"
            autoFocus
          />
        </div>
      }
    >
      {items === null ? (
        <EmptyState icon="archive" title="Loading archive…" />
      ) : list.length === 0 ? (
        <EmptyState
          icon="archive"
          title={debounced ? 'No matches' : 'Nothing archived'}
          hint={
            debounced
              ? `No archived tab matches “${debounced}”.`
              : 'Closed tabs and tabs that have been idle for a while land here so you can bring them back.'
          }
          testId="archive-empty"
        />
      ) : (
        <>
          <div className={rows.hintBar}>
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> navigate
            </span>
            <span>
              <kbd>↩</kbd> restore
            </span>
            <span>
              <kbd>{modKey}</kbd> <kbd>⌫</kbd> remove
            </span>
          </div>
          <VirtualList
            rows={list}
            rowHeight={rowHeight}
            rowKey={rowKey}
            scrollToIndex={selected}
            testId="archive-list"
            ariaLabel="Archived tabs"
            onKeyDown={onKeyDown}
            renderRow={(tab, i) => (
              <div
                className={rows.row}
                role="listitem"
                data-testid="archive-row"
                data-selected={i === selected}
                onMouseEnter={() => setSelected(i)}
                onDoubleClick={() => void restore(tab)}
              >
                <span className={rows.icon}>
                  <Favicon
                    tab={{ favicon: tab.favicon, emoji: null, url: tab.url, sleeping: false, loading: false }}
                  />
                </span>
                <span className={rows.text}>
                  <span className={rows.title}>
                    {displayTitle({ customTitle: null, title: tab.title, url: tab.url })}
                  </span>
                  <span className={rows.meta}>
                    <span>{hostOf(tab.url) || tab.url}</span>
                    <span className={rows.dot} />
                    <span>{REASON_LABEL[tab.reason]}</span>
                    <span className={rows.dot} />
                    <span>{timeAgo(tab.archivedAt, now)}</span>
                  </span>
                </span>
                {tab.spaceName && <Badge tone="accent">{tab.spaceName}</Badge>}
                <span className={rows.rowActions}>
                  <Button
                    variant="accent"
                    size="sm"
                    icon="reload"
                    testId="archive-restore"
                    onClick={() => void restore(tab)}
                  >
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    aria-label="Remove from archive"
                    title="Remove from archive"
                    testId="archive-remove"
                    onClick={() => void remove(tab)}
                  />
                </span>
              </div>
            )}
          />
        </>
      )}
    </PageShell>
  );
}
