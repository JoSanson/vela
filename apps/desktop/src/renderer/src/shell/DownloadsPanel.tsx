import type { DownloadItemState, Translator } from '@vela/shared';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { invoke, vela } from '../lib/api';
import { useT } from '../lib/i18n';
import styles from './DownloadsPanel.module.css';

function fmtBytes(t: Translator, n: number): string {
  const num = (v: number, digits: number): string =>
    new Intl.NumberFormat(t.locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: false,
    }).format(v);
  if (n < 1024) return t('shell.downloads.bytes', { n: num(n, 0) });
  if (n < 1024 * 1024) return t('shell.downloads.kilobytes', { n: num(n / 1024, 0) });
  if (n < 1024 * 1024 * 1024) return t('shell.downloads.megabytes', { n: num(n / 1024 / 1024, 1) });
  return t('shell.downloads.gigabytes', { n: num(n / 1024 / 1024 / 1024, 2) });
}

export function DownloadsPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
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
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
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
      aria-label={t('shortcut.downloads')}
      data-testid="downloads-panel"
    >
      <div className={styles.head}>
        <strong>{t('shortcut.downloads')}</strong>
        <span style={{ flex: 1 }} />
        <button
          className={styles.link}
          onClick={() => void invoke('tab/openUrl', { input: 'vela://downloads', noAtc: true })}
        >
          {t('shell.downloads.seeAll')}
        </button>
        {items.some((i) => i.state !== 'progressing') && (
          <button className={styles.link} onClick={() => void invoke('downloads/clear', undefined)}>
            {t('shell.downloads.clear')}
          </button>
        )}
      </div>
      {items.length === 0 && <p className={styles.empty}>{t('shell.downloads.empty')}</p>}
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
                      {d.totalBytes > 0
                        ? t('shell.downloads.progress', {
                            received: fmtBytes(t, d.receivedBytes),
                            total: fmtBytes(t, d.totalBytes),
                          })
                        : fmtBytes(t, d.receivedBytes)}
                    </span>
                  </>
                ) : (
                  <span className={styles.state}>
                    {d.state === 'completed'
                      ? fmtBytes(t, d.receivedBytes)
                      : d.state === 'cancelled'
                        ? t('shell.downloads.state.cancelled')
                        : t('shell.downloads.state.interrupted')}
                  </span>
                )}
              </div>
              <div className={styles.actions}>
                {d.state === 'progressing' && (
                  <button
                    onClick={() => act(d.id, d.paused ? 'resume' : 'pause')}
                    aria-label={d.paused ? t('shell.downloads.resume') : t('shell.downloads.pause')}
                  >
                    <Icon name={d.paused ? 'play' : 'pause'} size={13} />
                  </button>
                )}
                {d.state === 'progressing' && (
                  <button onClick={() => act(d.id, 'cancel')} aria-label={t('shell.downloads.cancel')}>
                    <Icon name="close" size={13} />
                  </button>
                )}
                {d.state === 'completed' && (
                  <button
                    onClick={() => act(d.id, 'showInFolder')}
                    aria-label={t('shell.downloads.showInFolder')}
                  >
                    <Icon name="folder" size={13} />
                  </button>
                )}
                {d.state !== 'progressing' && (
                  <button
                    onClick={() => act(d.id, 'remove')}
                    aria-label={t('shell.downloads.removeFromList')}
                  >
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
