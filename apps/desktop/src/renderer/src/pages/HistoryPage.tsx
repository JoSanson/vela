import { displayTitle, hostOf } from '@vela/core';
import type { HistoryEntry } from '@vela/shared';
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Favicon } from '../components/Favicon';
import { isMac, modKey } from '../lib/api';
import { useT } from '../lib/i18n';
import { dayKey, dayLabel, formatTime, openUrl, tryInvoke } from './lib';
import { PageShell } from './PageShell';
import rows from './rows.module.css';
import { useToast } from './Toast';
import { Button, ConfirmButton, EmptyState, SearchBox, Spinner } from './ui';
import { VirtualList } from './VirtualList';

const PAGE = 200;
const DAY_H = 40;
const ROW_H = 52;

type Row = { kind: 'day'; key: string; day: number } | { kind: 'entry'; entry: HistoryEntry };

function rowHeight(row: Row): number {
  return row.kind === 'day' ? DAY_H : ROW_H;
}

function rowKey(row: Row): string {
  return row.kind === 'day' ? row.key : `e${row.entry.id}`;
}

export function HistoryPage() {
  const t = useT();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState(-1);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 150);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    void tryInvoke('history/search', { query: debounced, limit: PAGE, offset: 0 }).then((res) => {
      if (cancelled) return;
      const list = res ?? [];
      setEntries(list);
      setExhausted(list.length < PAGE);
      setSelected(-1);
    });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const list = useMemo<Row[]>(() => {
    if (!entries) return [];
    const out: Row[] = [];
    let currentDay = -1;
    for (const e of entries) {
      const day = dayKey(e.visitedAt);
      if (day !== currentDay) {
        currentDay = day;
        out.push({ kind: 'day', key: `d${day}`, day });
      }
      out.push({ kind: 'entry', entry: e });
    }
    return out;
  }, [entries]);

  const entryRows = useMemo(() => list.flatMap((r, i) => (r.kind === 'entry' ? [i] : [])), [list]);

  const loadMore = async (): Promise<void> => {
    if (!entries || loadingMore) return;
    setLoadingMore(true);
    const more = await tryInvoke('history/search', { query: debounced, limit: PAGE, offset: entries.length });
    setLoadingMore(false);
    if (!more) return;
    setEntries((prev) => [...(prev ?? []), ...more]);
    if (more.length < PAGE) setExhausted(true);
  };

  const remove = useCallback(
    async (entry: HistoryEntry): Promise<void> => {
      const ok = await tryInvoke('history/delete', { ids: [entry.id] });
      if (ok === null) {
        toast(t('pages.history.deleteFailed'), 'error');
        return;
      }
      setEntries((prev) => prev?.filter((e) => e.id !== entry.id) ?? prev);
    },
    [toast, t],
  );

  const clearAll = async (): Promise<void> => {
    const ok = await tryInvoke('history/delete', { all: true });
    if (ok === null) {
      toast(t('pages.history.clearFailed'), 'error');
      return;
    }
    setEntries([]);
    setExhausted(true);
    toast(t('pages.history.cleared'));
  };

  const open = (entry: HistoryEntry): void => openUrl(entry.url);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (entryRows.length === 0) return;
    const pos = entryRows.indexOf(selected);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(entryRows[Math.min(entryRows.length - 1, pos + 1)] ?? -1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(pos <= 0 ? -1 : (entryRows[pos - 1] ?? -1));
    } else if (e.key === 'Enter' && selected >= 0) {
      const row = list[selected];
      if (row?.kind === 'entry') {
        e.preventDefault();
        open(row.entry);
      }
    } else if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      selected >= 0 &&
      (isMac ? e.metaKey : e.ctrlKey)
    ) {
      const row = list[selected];
      if (row?.kind === 'entry') {
        e.preventDefault();
        void remove(row.entry);
      }
    } else if (e.key === 'Escape') {
      setSelected(-1);
    }
  };

  const count = entries?.length ?? 0;
  const shown = `${count}${exhausted ? '' : '+'}`;
  const subtitle = entries
    ? debounced
      ? t('pages.history.countMatching', { n: count, shown })
      : t('pages.history.count', { n: count, shown })
    : t('common.loading');

  return (
    <PageShell
      title={t('pages.history.title')}
      icon="history"
      subtitle={subtitle}
      testId="page-history"
      fill
      actions={
        <ConfirmButton
          label={t('pages.history.clear')}
          question={t('pages.history.clearQuestion')}
          confirmLabel={t('pages.history.clearConfirm')}
          icon="trash"
          testId="history-clear"
          disabled={!entries || entries.length === 0}
          onConfirm={() => void clearAll()}
        />
      }
      toolbar={
        <div style={{ flex: 1 }} onKeyDown={onKeyDown}>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder={t('pages.history.searchPlaceholder')}
            testId="history-search"
            autoFocus
          />
        </div>
      }
    >
      {entries === null ? (
        <EmptyState icon="history" title={t('pages.history.loading')} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="history"
          title={debounced ? t('pages.history.noMatches') : t('pages.history.empty')}
          hint={
            debounced
              ? t('pages.history.noMatchesHint', { query: debounced })
              : t('pages.history.emptyHint', { mod: modKey })
          }
          testId="history-empty"
        />
      ) : (
        <>
          <div className={rows.hintBar}>
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> {t('pages.hintBar.navigate')}
            </span>
            <span>
              <kbd>↩</kbd> {t('pages.hintBar.open')}
            </span>
            <span>
              <kbd>{modKey}</kbd> <kbd>⌫</kbd> {t('pages.hintBar.delete')}
            </span>
          </div>
          <VirtualList
            rows={list}
            rowHeight={rowHeight}
            rowKey={rowKey}
            scrollToIndex={selected}
            testId="history-list"
            ariaLabel={t('pages.history.listLabel')}
            onKeyDown={onKeyDown}
            footer={
              exhausted ? (
                <span className={rows.count}>{t('pages.history.end')}</span>
              ) : (
                <Button
                  variant="secondary"
                  testId="history-load-more"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? <Spinner /> : null}
                  {t('pages.history.loadMore')}
                </Button>
              )
            }
            renderRow={(row, i) =>
              row.kind === 'day' ? (
                <div className={rows.dayHeader}>{dayLabel(row.day)}</div>
              ) : (
                <div
                  className={rows.row}
                  role="listitem"
                  data-testid="history-row"
                  data-selected={i === selected}
                  onClick={() => open(row.entry)}
                  onMouseEnter={() => setSelected(i)}
                >
                  <span className={rows.icon}>
                    <Favicon
                      tab={{
                        favicon: row.entry.favicon,
                        emoji: null,
                        url: row.entry.url,
                        sleeping: false,
                        loading: false,
                      }}
                    />
                  </span>
                  <span className={rows.text}>
                    <span className={rows.title}>
                      {displayTitle({ customTitle: null, title: row.entry.title, url: row.entry.url })}
                    </span>
                    <span className={rows.meta}>
                      <span>{hostOf(row.entry.url) || row.entry.url}</span>
                      {row.entry.visitCount > 1 && (
                        <>
                          <span className={rows.dot} />
                          <span>{t('pages.history.visitCount', { n: row.entry.visitCount })}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <span className={rows.rowActions}>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="trash"
                      aria-label={t('pages.history.delete')}
                      title={t('pages.history.delete')}
                      testId="history-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(row.entry);
                      }}
                    />
                  </span>
                  <span className={rows.time}>{formatTime(row.entry.visitedAt)}</span>
                </div>
              )
            }
          />
        </>
      )}
    </PageShell>
  );
}
