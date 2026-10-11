import { createId, displayTitle, hostOf, type ArchivedTab } from '@vela/core';
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Favicon } from '../components/Favicon';
import { isMac, modKey } from '../lib/api';
import { useT } from '../lib/i18n';
import { now as nowMs, timeAgo, tryInvoke, useNow, useSnapshot } from './lib';
import { PageShell } from './PageShell';
import rows from './rows.module.css';
import { useToast } from './Toast';
import { Badge, Button, ConfirmButton, EmptyState, SearchBox } from './ui';
import { VirtualList } from './VirtualList';

const ROW_H = 56;
const LIMIT = 5000;

const REASON_KEY = {
  auto: 'pages.archive.reason.auto',
  manual: 'pages.archive.reason.manual',
  closed: 'pages.archive.reason.closed',
} as const satisfies Record<ArchivedTab['reason'], string>;

export function ArchivePage() {
  const t = useT();
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
      toast(t('pages.archive.restoreFailed'), 'error');
      return;
    }
    setItems((prev) => prev?.filter((t) => t.id !== tab.id) ?? prev);
    toast(
      t('pages.archive.restored', {
        title: displayTitle({ customTitle: null, title: tab.title, url: tab.url }),
      }),
    );
  };

  const remove = async (tab: ArchivedTab): Promise<void> => {
    const ok = await dispatch({ type: 'archive/remove', id: tab.id });
    if (!ok) {
      toast(t('pages.archive.removeFailed'), 'error');
      return;
    }
    setItems((prev) => prev?.filter((t) => t.id !== tab.id) ?? prev);
  };

  const clear = async (): Promise<void> => {
    const ok = await dispatch({ type: 'archive/clear' });
    if (!ok) {
      toast(t('pages.archive.clearFailed'), 'error');
      return;
    }
    setItems([]);
    setReload((n) => n + 1);
    toast(t('pages.archive.cleared'));
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
    ? debounced
      ? t('pages.archive.countMatching', { n: list.length })
      : t('common.tabs.count', { n: list.length })
    : t('common.loading');

  return (
    <PageShell
      title={t('pages.archive.title')}
      icon="archive"
      subtitle={subtitle}
      testId="page-archive"
      fill
      actions={
        <ConfirmButton
          label={t('pages.archive.clear')}
          question={t('pages.archive.clearQuestion')}
          confirmLabel={t('pages.archive.clearConfirm')}
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
            placeholder={t('pages.archive.searchPlaceholder')}
            testId="archive-search"
            autoFocus
          />
        </div>
      }
    >
      {items === null ? (
        <EmptyState icon="archive" title={t('pages.archive.loading')} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="archive"
          title={debounced ? t('pages.archive.noMatches') : t('pages.archive.empty')}
          hint={
            debounced ? t('pages.archive.noMatchesHint', { query: debounced }) : t('pages.archive.emptyHint')
          }
          testId="archive-empty"
        />
      ) : (
        <>
          <div className={rows.hintBar}>
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> {t('pages.hintBar.navigate')}
            </span>
            <span>
              <kbd>↩</kbd> {t('pages.hintBar.restore')}
            </span>
            <span>
              <kbd>{modKey}</kbd> <kbd>⌫</kbd> {t('pages.hintBar.remove')}
            </span>
          </div>
          <VirtualList
            rows={list}
            rowHeight={rowHeight}
            rowKey={rowKey}
            scrollToIndex={selected}
            testId="archive-list"
            ariaLabel={t('pages.archive.listLabel')}
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
                    <span>{t(REASON_KEY[tab.reason])}</span>
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
                    {t('pages.archive.restore')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    aria-label={t('pages.archive.remove')}
                    title={t('pages.archive.remove')}
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
