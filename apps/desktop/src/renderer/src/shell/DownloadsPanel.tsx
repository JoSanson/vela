import type { DownloadItemState } from '@vela/shared';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { invoke, vela } from '../lib/api';
import styles from './DownloadsPanel.module.css';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function DownloadsPanel({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<DownloadItemState[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void invoke('downloads/list', undefined)
      .then(setItems)
      .catch(() => undefined);
    return vela.on('downloads/changed', setItems);
  }, []);
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);
  const act = (
    id: string,
    action: 'pause' | 'resume' | 'cancel' | 'open' | 'showInFolder' | 'remove',
  ): void => void invoke('downloads/action', { id, action });
  return (
    <div
      ref={ref}
      className={styles.panel}
      role="dialog"
      aria-label="Downloads"
      data-testid="downloads-panel"
    >
      <div className={styles.head}>
        <strong>Downloads</strong>
        <span style={{ flex: 1 }} />
        <button
          className={styles.link}
          onClick={() => void invoke('tab/openUrl', { input: 'vela://downloads', noAtc: true })}
        >
          See all
        </button>
        {items.some((i) => i.state !== 'progressing') && (
          <button className={styles.link} onClick={() => void invoke('downloads/clear', undefined)}>
            Clear
          </button>
        )}
      </div>
      {items.length === 0 && <p className={styles.empty}>Files you download will show up here.</p>}
      <ul className={styles.list}>
        {items.slice(0, 8).map((d) => {
          const pct = d.totalBytes > 0 ? Math.min(100, (d.receivedBytes / d.totalBytes) * 100) : 0;
          return (
            <li key={d.id} className={styles.item} data-testid="download-item" data-state={d.state}>
              <button
                className={styles.file}
                onClick={() => d.state === 'completed' && act(d.id, 'open')}
                title={d.path}
              >
                <Icon
                  name={
                    d.state === 'completed' ? 'check' : d.state === 'progressing' ? 'download' : 'warning'
                  }
                  size={14}
                />
                <span className={styles.name}>{d.filename}</span>
              </button>
              <div className={styles.meta}>
                {d.state === 'progressing' ? (
                  <>
                    <div className={styles.bar}>
                      <div className={styles.fill} style={{ transform: `scaleX(${pct / 100})` }} />
                    </div>
                    <span>
                      {fmtBytes(d.receivedBytes)}
                      {d.totalBytes > 0 ? ` / ${fmtBytes(d.totalBytes)}` : ''}
                    </span>
                  </>
                ) : (
                  <span className={styles.state}>
                    {d.state === 'completed' ? fmtBytes(d.receivedBytes) : d.state}
                  </span>
                )}
              </div>
              <div className={styles.actions}>
                {d.state === 'progressing' && (
                  <button
                    onClick={() => act(d.id, d.paused ? 'resume' : 'pause')}
                    aria-label={d.paused ? 'Resume' : 'Pause'}
                  >
                    <Icon name={d.paused ? 'play' : 'pause'} size={13} />
                  </button>
                )}
                {d.state === 'progressing' && (
                  <button onClick={() => act(d.id, 'cancel')} aria-label="Cancel">
                    <Icon name="close" size={13} />
                  </button>
                )}
                {d.state === 'completed' && (
                  <button onClick={() => act(d.id, 'showInFolder')} aria-label="Show in folder">
                    <Icon name="folder" size={13} />
                  </button>
                )}
                {d.state !== 'progressing' && (
                  <button onClick={() => act(d.id, 'remove')} aria-label="Remove from list">
                    <Icon name="trash" size={13} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
