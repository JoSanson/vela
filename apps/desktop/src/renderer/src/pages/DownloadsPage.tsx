import { hostOf } from '@vela/core';
import type { DownloadItemState, Translator } from '@vela/shared';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { useT } from '../lib/i18n';
import { formatBytes, formatDuration, now as nowMs, timeAgo, tryInvoke, useEvent, useNow } from './lib';
import { PageShell } from './PageShell';
import styles from './DownloadsPage.module.css';
import { useToast } from './Toast';
import { Badge, Button, ConfirmButton, EmptyState } from './ui';

type Action = 'pause' | 'resume' | 'cancel' | 'open' | 'showInFolder' | 'remove' | 'retry' | 'keep';

const ACTION_FAILED = {
  pause: 'pages.downloads.actionFailed.pause',
  resume: 'pages.downloads.actionFailed.resume',
  cancel: 'pages.downloads.actionFailed.cancel',
  open: 'pages.downloads.actionFailed.open',
  showInFolder: 'pages.downloads.actionFailed.showInFolder',
  remove: 'pages.downloads.actionFailed.remove',
  retry: 'pages.downloads.actionFailed.retry',
  keep: 'pages.downloads.actionFailed.keep',
} as const satisfies Record<Action, string>;

interface Sample {
  bytes: number;
  at: number;
  speed: number;
}

function stateBadge(
  d: DownloadItemState,
  t: Translator,
): {
  label: string;
  tone: 'accent' | 'success' | 'warning' | 'danger';
} {
  if (d.state === 'completed') return { label: t('pages.downloads.state.done'), tone: 'success' };
  if (d.state === 'cancelled') return { label: t('pages.downloads.state.cancelled'), tone: 'danger' };
  if (d.state === 'interrupted') return { label: t('pages.downloads.state.failed'), tone: 'danger' };
  if (d.dangerous) return { label: t('pages.downloads.state.held'), tone: 'warning' };
  if (d.paused) return { label: t('pages.downloads.state.paused'), tone: 'warning' };
  return { label: t('pages.downloads.state.downloading'), tone: 'accent' };
}

export function DownloadsPage() {
  const t = useT();
  const { toast } = useToast();
  const [items, setItems] = useState<DownloadItemState[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const samples = useRef(new Map<string, Sample>());
  const [speeds, setSpeeds] = useState<Record<string, number>>({});
  const now = useNow();

  useEffect(() => {
    let cancelled = false;
    void tryInvoke('downloads/list', undefined).then((res) => {
      if (cancelled) return;
      if (res === null) setUnavailable(true);
      setItems(res ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEvent('downloads/changed', (list) => {
    const at = nowMs();
    const next: Record<string, number> = {};
    for (const d of list) {
      const prev = samples.current.get(d.id);
      let speed = prev?.speed ?? 0;
      if (prev && at > prev.at && d.state === 'progressing' && !d.paused) {
        const inst = ((d.receivedBytes - prev.bytes) * 1000) / (at - prev.at);
        speed = prev.speed ? prev.speed * 0.6 + inst * 0.4 : inst;
      } else if (d.state !== 'progressing' || d.paused) {
        speed = 0;
      }
      samples.current.set(d.id, { bytes: d.receivedBytes, at, speed });
      next[d.id] = speed;
    }
    setSpeeds(next);
    setItems(list);
    setUnavailable(false);
  });

  const act = async (d: DownloadItemState, action: Action): Promise<void> => {
    const ok = await tryInvoke('downloads/action', { id: d.id, action });
    if (ok === null) {
      toast(t(ACTION_FAILED[action]), 'error');
      return;
    }
    if (action === 'remove') setItems((prev) => prev?.filter((x) => x.id !== d.id) ?? prev);
    else {
      const list = await tryInvoke('downloads/list', undefined);
      if (list) setItems(list);
    }
  };

  const clearCompleted = async (): Promise<void> => {
    const ok = await tryInvoke('downloads/clear', undefined);
    if (ok === null) {
      toast(t('pages.downloads.clearFailed'), 'error');
      return;
    }
    setItems((prev) => prev?.filter((d) => d.state === 'progressing') ?? prev);
    toast(t('pages.downloads.cleared'));
  };

  const list = [...(items ?? [])].sort((a, b) => b.startedAt - a.startedAt);
  const active = list.filter((d) => d.state === 'progressing').length;
  const subtitle = items
    ? active > 0
      ? t('pages.downloads.inProgress', { active, total: list.length })
      : t('pages.downloads.count', { n: list.length })
    : t('common.loading');

  return (
    <PageShell
      title={t('pages.downloads.title')}
      icon="download"
      subtitle={subtitle}
      testId="page-downloads"
      actions={
        <ConfirmButton
          label={t('pages.downloads.clear')}
          question={t('pages.downloads.clearQuestion')}
          confirmLabel={t('pages.downloads.clearConfirm')}
          icon="trash"
          testId="downloads-clear"
          disabled={list.every((d) => d.state === 'progressing')}
          onConfirm={() => void clearCompleted()}
        />
      }
    >
      {unavailable && (
        <div className={styles.notice} data-testid="downloads-unavailable">
          <Icon name="warning" size={14} />
          {t('pages.downloads.unavailable')}
        </div>
      )}
      {items === null ? (
        <EmptyState icon="download" title={t('pages.downloads.loading')} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="download"
          title={t('pages.downloads.empty')}
          hint={t('pages.downloads.emptyHint')}
          testId="downloads-empty"
        />
      ) : (
        <div className={styles.list} data-testid="downloads-list">
          {list.map((d) => {
            const badge = stateBadge(d, t);
            const ratio = d.totalBytes > 0 ? Math.min(1, d.receivedBytes / d.totalBytes) : 0;
            const indeterminate = d.state === 'progressing' && d.totalBytes <= 0;
            const speed = speeds[d.id] ?? 0;
            const remaining =
              d.state === 'progressing' && !d.paused && speed > 0 && d.totalBytes > 0
                ? ((d.totalBytes - d.receivedBytes) * 1000) / speed
                : 0;
            return (
              <div key={d.id} className={styles.item} data-state={d.state} data-testid="download-item">
                <span className={styles.icon}>
                  <Icon
                    name={
                      d.state === 'completed' ? 'check' : d.state === 'progressing' ? 'download' : 'warning'
                    }
                    size={18}
                  />
                </span>
                <div className={styles.main}>
                  <div className={styles.nameRow}>
                    <span
                      className={styles.name}
                      title={d.path || d.url}
                      onClick={() => {
                        if (d.state === 'completed') void act(d, 'open');
                      }}
                    >
                      {d.filename || d.url}
                    </span>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </div>
                  <div className={styles.meta}>
                    {d.state === 'progressing' ? (
                      <>
                        <span>
                          {d.totalBytes > 0
                            ? t('pages.downloads.ofTotal', {
                                received: formatBytes(d.receivedBytes),
                                total: formatBytes(d.totalBytes),
                              })
                            : formatBytes(d.receivedBytes)}
                        </span>
                        {speed > 0 && !d.paused && (
                          <>
                            <span className={styles.dot} />
                            <span>{t('pages.downloads.speed', { speed: formatBytes(speed) })}</span>
                          </>
                        )}
                        {remaining > 0 && (
                          <>
                            <span className={styles.dot} />
                            <span>{t('pages.downloads.left', { duration: formatDuration(remaining) })}</span>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <span>
                          {formatBytes(
                            d.state === 'completed' ? d.totalBytes || d.receivedBytes : d.receivedBytes,
                          )}
                        </span>
                        <span className={styles.dot} />
                        <span>{hostOf(d.url) || d.url}</span>
                        <span className={styles.dot} />
                        <span>{timeAgo(d.endedAt ?? d.startedAt, now)}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className={styles.bar} role="progressbar" aria-valuenow={Math.round(ratio * 100)}>
                  <div
                    className={styles.fill}
                    data-paused={d.paused}
                    data-indeterminate={indeterminate}
                    style={indeterminate ? undefined : { transform: `scaleX(${ratio})` }}
                  />
                </div>
                <div className={styles.actions}>
                  {d.state === 'progressing' && !d.paused && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="pause"
                      aria-label={t('pages.downloads.pause')}
                      title={t('pages.downloads.pause')}
                      testId="download-pause"
                      onClick={() => void act(d, 'pause')}
                    />
                  )}
                  {d.state === 'progressing' && d.paused && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="play"
                      aria-label={t('pages.downloads.resume')}
                      title={t('pages.downloads.resume')}
                      testId="download-resume"
                      onClick={() => void act(d, 'resume')}
                    />
                  )}
                  {d.state === 'progressing' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="close"
                      aria-label={t('pages.downloads.cancel')}
                      title={t('pages.downloads.cancel')}
                      testId="download-cancel"
                      onClick={() => void act(d, 'cancel')}
                    />
                  )}
                  {d.dangerous && d.state === 'progressing' && (
                    <Button
                      variant="accent"
                      size="sm"
                      testId="download-keep"
                      onClick={() => void act(d, 'keep')}
                    >
                      {t('pages.downloads.keep')}
                    </Button>
                  )}
                  {(d.state === 'interrupted' || d.state === 'cancelled') && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="reload"
                      testId="download-retry"
                      onClick={() => void act(d, 'retry')}
                    >
                      {t('pages.downloads.retry')}
                    </Button>
                  )}
                  {d.state === 'completed' && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        testId="download-open"
                        onClick={() => void act(d, 'open')}
                      >
                        {t('common.open')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="folder"
                        aria-label={t('pages.downloads.showInFolder')}
                        title={t('pages.downloads.showInFolder')}
                        testId="download-show"
                        onClick={() => void act(d, 'showInFolder')}
                      />
                    </>
                  )}
                  {d.state !== 'progressing' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="trash"
                      aria-label={t('pages.downloads.remove')}
                      title={t('pages.downloads.remove')}
                      testId="download-remove"
                      onClick={() => void act(d, 'remove')}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
