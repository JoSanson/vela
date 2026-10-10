import { hostOf } from '@vela/core';
import type { DownloadItemState } from '@vela/shared';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { formatBytes, formatDuration, now as nowMs, timeAgo, tryInvoke, useEvent, useNow } from './lib';
import { PageShell } from './PageShell';
import styles from './DownloadsPage.module.css';
import { useToast } from './Toast';
import { Badge, Button, ConfirmButton, EmptyState } from './ui';

type Action = 'pause' | 'resume' | 'cancel' | 'open' | 'showInFolder' | 'remove' | 'retry' | 'keep';

interface Sample {
  bytes: number;
  at: number;
  speed: number;
}

function stateBadge(d: DownloadItemState): {
  label: string;
  tone: 'accent' | 'success' | 'warning' | 'danger';
} {
  if (d.state === 'completed') return { label: 'Done', tone: 'success' };
  if (d.state === 'cancelled') return { label: 'Cancelled', tone: 'danger' };
  if (d.state === 'interrupted') return { label: 'Failed', tone: 'danger' };
  if (d.dangerous) return { label: 'Held', tone: 'warning' };
  if (d.paused) return { label: 'Paused', tone: 'warning' };
  return { label: 'Downloading', tone: 'accent' };
}

export function DownloadsPage() {
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
      toast(`Couldn't ${action === 'showInFolder' ? 'reveal' : action} this download`, 'error');
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
      toast("Couldn't clear downloads", 'error');
      return;
    }
    setItems((prev) => prev?.filter((d) => d.state === 'progressing') ?? prev);
    toast('Completed downloads cleared');
  };

  const list = [...(items ?? [])].sort((a, b) => b.startedAt - a.startedAt);
  const active = list.filter((d) => d.state === 'progressing').length;
  const subtitle = items
    ? active > 0
      ? `${active} in progress · ${list.length} total`
      : `${list.length} ${list.length === 1 ? 'download' : 'downloads'}`
    : 'Loading…';

  return (
    <PageShell
      title="Downloads"
      icon="download"
      subtitle={subtitle}
      testId="page-downloads"
      actions={
        <ConfirmButton
          label="Clear completed"
          question="Remove finished downloads from the list?"
          confirmLabel="Clear"
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
          Download tracking isn’t available in this build yet.
        </div>
      )}
      {items === null ? (
        <EmptyState icon="download" title="Loading downloads…" />
      ) : list.length === 0 ? (
        <EmptyState
          icon="download"
          title="No downloads"
          hint="Files you download will appear here with their progress. Completed files can be opened or revealed in the Finder."
          testId="downloads-empty"
        />
      ) : (
        <div className={styles.list} data-testid="downloads-list">
          {list.map((d) => {
            const badge = stateBadge(d);
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
                          {formatBytes(d.receivedBytes)}
                          {d.totalBytes > 0 ? ` of ${formatBytes(d.totalBytes)}` : ''}
                        </span>
                        {speed > 0 && !d.paused && (
                          <>
                            <span className={styles.dot} />
                            <span>{formatBytes(speed)}/s</span>
                          </>
                        )}
                        {remaining > 0 && (
                          <>
                            <span className={styles.dot} />
                            <span>{formatDuration(remaining)} left</span>
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
                      aria-label="Pause"
                      title="Pause"
                      testId="download-pause"
                      onClick={() => void act(d, 'pause')}
                    />
                  )}
                  {d.state === 'progressing' && d.paused && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="play"
                      aria-label="Resume"
                      title="Resume"
                      testId="download-resume"
                      onClick={() => void act(d, 'resume')}
                    />
                  )}
                  {d.state === 'progressing' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="close"
                      aria-label="Cancel"
                      title="Cancel"
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
                      Keep
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
                      Retry
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
                        Open
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="folder"
                        aria-label="Show in folder"
                        title="Show in folder"
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
                      aria-label="Remove from list"
                      title="Remove from list"
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
