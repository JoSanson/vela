import type { DownloadItemState, Translator } from '@vela/shared';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../components/Icon';
import { invoke, isMac, vela } from '../lib/api';
import { useT } from '../lib/i18n';
import styles from './DownloadsView.module.css';

type Action = 'pause' | 'resume' | 'cancel' | 'open' | 'showInFolder' | 'remove' | 'retry' | 'keep';

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

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** "Contrat_Hacquisition_2026_final.pdf" keeps ".pdf" visible: the base is what gets ellipsised. */
function splitName(name: string): [string, string] {
  const dot = name.lastIndexOf('.');
  return dot > 0 && name.length - dot <= 6 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
}

function dayLabel(t: Translator, at: number): string {
  const d = new Date(at);
  const today = new Date();
  const start = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(today) - start(d)) / 86_400_000);
  if (days === 0) return t('shell.downloads.today');
  if (days === 1) return t('shell.downloads.yesterday');
  return new Intl.DateTimeFormat(t.locale, {
    weekday: days < 7 ? 'long' : undefined,
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(d);
}

function DownloadRow({
  item,
  icon,
  t,
}: {
  item: DownloadItemState;
  icon: string | null | undefined;
  t: Translator;
}) {
  const act = (action: Action): void => void invoke('downloads/action', { id: item.id, action });
  const [base, ext] = splitName(item.filename);
  const host = hostOf(item.url);
  const done = item.state === 'completed';
  const missing = done && icon === null;
  const progressing = item.state === 'progressing';
  const pct = item.totalBytes > 0 ? Math.min(1, item.receivedBytes / item.totalBytes) : null;
  const time = new Intl.DateTimeFormat(t.locale, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(item.endedAt ?? item.startedAt),
  );

  let meta: string;
  let tone: 'muted' | 'danger' | 'warn' = 'muted';
  if (item.dangerous && progressing) {
    meta = t('shell.downloads.dangerous');
    tone = 'warn';
  } else if (progressing) {
    const amount =
      item.totalBytes > 0
        ? t('shell.downloads.progress', {
            received: fmtBytes(t, item.receivedBytes),
            total: fmtBytes(t, item.totalBytes),
          })
        : fmtBytes(t, item.receivedBytes);
    meta = item.paused ? `${t('shell.downloads.state.paused')} · ${amount}` : amount;
  } else if (item.state === 'interrupted') {
    meta = [t('shell.downloads.state.interrupted'), host].filter(Boolean).join(' · ');
    tone = 'danger';
  } else if (item.state === 'cancelled') {
    meta = [t('shell.downloads.state.cancelled'), host].filter(Boolean).join(' · ');
  } else if (missing) {
    meta = [t('shell.downloads.state.missing'), host].filter(Boolean).join(' · ');
  } else {
    meta = [fmtBytes(t, item.totalBytes || item.receivedBytes), host, time].filter(Boolean).join(' · ');
  }

  return (
    <li
      className={styles.row}
      data-state={item.state}
      data-dangerous={item.dangerous ? 'true' : undefined}
      data-testid="download-item"
    >
      <button
        className={styles.main}
        onClick={() => {
          if (done && !missing) act('open');
        }}
        disabled={!done || missing}
        aria-label={t('shell.downloads.open', { name: item.filename })}
        draggable={done && !missing}
        onDragStart={(e) => {
          e.preventDefault();
          vela.send('downloads/drag', { id: item.id });
        }}
        data-row
      >
        {icon ? (
          <img className={styles.fileIcon} src={icon} alt="" draggable={false} />
        ) : (
          <span className={styles.fileIconFallback}>
            <Icon name={progressing ? 'download' : 'archive'} size={16} />
          </span>
        )}
        <span className={styles.text}>
          <span className={styles.name} title={item.filename}>
            <span className={styles.base}>{base}</span>
            {ext && <span className={styles.ext}>{ext}</span>}
          </span>
          <span className={styles.meta} data-tone={tone}>
            {meta}
          </span>
          {progressing && (
            <span className={styles.track} aria-hidden="true">
              <span
                className={styles.fill}
                data-indeterminate={pct === null ? 'true' : undefined}
                data-paused={item.paused ? 'true' : undefined}
                style={pct === null ? undefined : { transform: `scaleX(${pct})` }}
              />
            </span>
          )}
        </span>
      </button>
      <span
        className={styles.actions}
        data-sticky={progressing || item.state === 'interrupted' ? 'true' : undefined}
      >
        {item.dangerous && progressing ? (
          <>
            <button className={styles.textBtn} onClick={() => act('keep')}>
              {t('shell.downloads.keep')}
            </button>
            <button className={styles.textBtn} data-danger onClick={() => act('cancel')}>
              {t('shell.downloads.discard')}
            </button>
          </>
        ) : progressing ? (
          <>
            <button
              className={styles.iconBtn}
              onClick={() => act(item.paused ? 'resume' : 'pause')}
              aria-label={item.paused ? t('shell.downloads.resume') : t('shell.downloads.pause')}
              title={item.paused ? t('shell.downloads.resume') : t('shell.downloads.pause')}
            >
              <Icon name={item.paused ? 'play' : 'pause'} size={14} />
            </button>
            <button
              className={styles.iconBtn}
              onClick={() => act('cancel')}
              aria-label={t('shell.downloads.cancel')}
              title={t('shell.downloads.cancel')}
            >
              <Icon name="close" size={14} />
            </button>
          </>
        ) : (
          <>
            {item.state === 'interrupted' || item.state === 'cancelled' ? (
              <button
                className={styles.iconBtn}
                onClick={() => act('retry')}
                aria-label={t('shell.downloads.retry')}
                title={t('shell.downloads.retry')}
              >
                <Icon name="reload" size={14} />
              </button>
            ) : (
              <button
                className={styles.iconBtn}
                onClick={() => act('showInFolder')}
                disabled={missing}
                aria-label={isMac ? t('shell.downloads.showInFinder') : t('shell.downloads.showInFolder')}
                title={isMac ? t('shell.downloads.showInFinder') : t('shell.downloads.showInFolder')}
              >
                <Icon name="folder" size={14} />
              </button>
            )}
            <button
              className={styles.iconBtn}
              onClick={() => act('remove')}
              aria-label={t('shell.downloads.removeFromList')}
              title={t('shell.downloads.removeFromList')}
              data-testid="download-remove"
            >
              <Icon name="close" size={14} />
            </button>
          </>
        )}
      </span>
    </li>
  );
}

/** Downloads in place of the sidebar's content: back (button or Escape) returns to the tabs. */
export function DownloadsView({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [items, setItems] = useState<DownloadItemState[]>([]);
  const [icons, setIcons] = useState<Record<string, string | null>>({});
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void invoke('downloads/list', undefined).then(setItems, () => undefined);
    return vela.on('downloads/changed', setItems);
  }, []);
  useEffect(() => {
    searchRef.current?.focus({ preventScroll: true });
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') {
        const search = searchRef.current;
        if (search && search === document.activeElement && search.value) return;
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Finder icons, fetched once per finished file; null means the file is no longer on disk.
  useEffect(() => {
    for (const d of items) {
      if (d.state !== 'completed' || d.id in icons) continue;
      void invoke('downloads/icon', { id: d.id }).then(
        (icon) => setIcons((m) => ({ ...m, [d.id]: icon })),
        () => setIcons((m) => ({ ...m, [d.id]: null })),
      );
    }
  }, [items, icons]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? items.filter((d) => `${d.filename} ${hostOf(d.url)}`.toLowerCase().includes(q)) : items),
    [items, q],
  );
  const active = filtered.filter((d) => d.state === 'progressing');
  const groups = useMemo(() => {
    const out: { label: string; items: DownloadItemState[] }[] = [];
    const rest = filtered
      .filter((d) => d.state !== 'progressing')
      .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt));
    for (const d of rest) {
      const label = dayLabel(t, d.endedAt ?? d.startedAt);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(d);
      else out.push({ label, items: [d] });
    }
    return out;
  }, [filtered, t]);
  const finished = items.some((d) => d.state !== 'progressing');

  const onListKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-row]') ?? [])];
    const idx = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = rows[Math.max(0, Math.min(rows.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))];
      next?.focus();
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && idx >= 0) {
      // Finished rows only: an in-progress download is cancelled with its own button, not a key.
      const remove = rows[idx]
        ?.closest('li')
        ?.querySelector<HTMLButtonElement>('[data-testid="download-remove"]');
      if (!remove) return;
      e.preventDefault();
      (rows[idx + 1] ?? rows[idx - 1])?.focus();
      remove.click();
    }
  };

  return (
    <section className={styles.view} aria-label={t('shell.downloads.title')} data-testid="downloads-view">
      <header className={styles.head}>
        <button
          className={`${styles.back} no-drag`}
          onClick={onClose}
          aria-label={t('shell.downloads.back')}
          title={`${t('shell.downloads.back')} (Esc)`}
          data-testid="downloads-back"
        >
          <Icon name="back" size={16} />
        </button>
        <h2 className={styles.title}>{t('shell.downloads.title')}</h2>
        <button
          className={`${styles.clear} no-drag`}
          onClick={() => void invoke('downloads/clear', undefined)}
          disabled={!finished}
        >
          {t('shell.downloads.clear')}
        </button>
      </header>
      {items.length > 0 && (
        <label className={styles.search}>
          <Icon name="search" size={13} />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('shell.downloads.search')}
            aria-label={t('shell.downloads.search')}
            spellCheck={false}
          />
        </label>
      )}
      <div ref={listRef} className={styles.scroll} onKeyDown={onListKey}>
        {items.length === 0 ? (
          <div className={styles.empty} data-testid="downloads-empty">
            <span className={styles.emptyIcon}>
              <Icon name="download" size={20} />
            </span>
            <p className={styles.emptyTitle}>{t('shell.downloads.empty.title')}</p>
            <p className={styles.emptyText}>{t('shell.downloads.empty')}</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className={styles.noMatch}>{t('shell.downloads.noMatch', { q: query.trim() })}</p>
        ) : (
          <>
            {active.length > 0 && (
              <div className={styles.group}>
                <h3 className={styles.label}>{t('shell.downloads.inProgress')}</h3>
                <ul className={styles.list}>
                  {active.map((d) => (
                    <DownloadRow key={d.id} item={d} icon={icons[d.id]} t={t} />
                  ))}
                </ul>
              </div>
            )}
            {groups.map((g) => (
              <div key={g.label} className={styles.group}>
                <h3 className={styles.label}>{g.label}</h3>
                <ul className={styles.list}>
                  {g.items.map((d) => (
                    <DownloadRow key={d.id} item={d} icon={icons[d.id]} t={t} />
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
