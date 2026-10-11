import type { DownloadItemState } from '@vela/shared';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { dispatch, invoke, modKey, vela } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { useShell } from '../../lib/store';
import { Icon } from '../Icon';
import styles from './SpaceBar.module.css';

export function SpaceBar() {
  const core = useShell((s) => s.core);
  const setDownloadsOpen = useShell((s) => s.setDownloadsOpen);
  const downloadsOpen = useShell((s) => s.downloadsOpen);
  const t = useT();
  const active = core.spaces[core.activeSpaceId];
  const isPrivate = !!core.profiles[active?.profileId ?? '']?.ephemeral;
  // Live download progress on the sidebar button: a ring fills while anything is in flight.
  const [downloads, setDownloads] = useState<DownloadItemState[]>([]);
  useEffect(() => {
    void invoke('downloads/list', undefined)
      .then(setDownloads)
      .catch(() => undefined);
    return vela.on('downloads/changed', setDownloads);
  }, []);
  const inFlight = downloads.filter((d) => d.state === 'progressing');
  const progress =
    inFlight.length === 0
      ? null
      : inFlight.reduce((s, d) => s + (d.totalBytes > 0 ? d.receivedBytes / d.totalBytes : 0), 0) /
        inFlight.length;
  const editSpace = (id: string): void =>
    void invoke('overlay/show', { kind: 'spaceEditor', payload: { spaceId: id } });
  // Many spaces overflow the row: it scrolls, and the active one is always brought into view.
  const dotsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dotsRef.current?.querySelector<HTMLElement>(
      `[data-space-id="${CSS.escape(core.activeSpaceId)}"]`,
    );
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [core.activeSpaceId]);
  const spaceName = active?.name ?? '';
  return (
    <div className={styles.bar}>
      <button
        className={styles.name}
        onClick={() => editSpace(core.activeSpaceId)}
        onContextMenu={(e) => {
          e.preventDefault();
          void invoke('menu/show', { kind: 'space', id: core.activeSpaceId });
        }}
        aria-label={
          isPrivate
            ? t('shell.spaceBar.editSpacePrivate', { name: spaceName })
            : t('shell.spaceBar.editSpace', { name: spaceName })
        }
        title={isPrivate ? t('shell.spaceBar.privateHint') : undefined}
        data-testid="space-name"
        data-private={isPrivate ? 'true' : undefined}
      >
        <span className={styles.label}>{active?.name}</span>
        {isPrivate && <Icon name="eye" size={12} className={styles.privateMark} />}
      </button>
      <div className={styles.dots} role="group" aria-label={t('shortcut.group.spaces')}>
        <div
          className={styles.dotsScroll}
          ref={dotsRef}
          onWheel={(e) => {
            const el = e.currentTarget;
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
          }}
          data-testid="space-dots"
        >
          {core.spaceOrder.map((id, i) => {
            const sp = core.spaces[id];
            if (!sp) return null;
            const isActive = id === core.activeSpaceId;
            return (
              <button
                key={id}
                aria-pressed={isActive}
                aria-label={t('shell.spaceBar.spaceShortcut', { name: sp.name, n: i + 1 })}
                title={sp.name}
                className={`${styles.dot} ${isActive ? styles.dotActive : ''}`}
                style={{ '--dot-color': sp.theme.from } as React.CSSProperties}
                onClick={() => dispatch({ type: 'space/activate', id, now: Date.now() })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  void invoke('menu/show', { kind: 'space', id });
                }}
                data-space-id={id}
                data-dnd-space={id}
              >
                {isActive ? <span aria-hidden="true">{sp.emoji}</span> : null}
              </button>
            );
          })}
        </div>
        <button
          className={styles.add}
          aria-label={t('shortcut.allSpaces')}
          title={t('shell.spaceBar.allSpacesTitle', { shortcut: `${modKey}⇧S` })}
          onClick={() => void invoke('overlay/show', { kind: 'spaces' })}
          data-testid="all-spaces"
        >
          <Icon name="layers" size={13} />
        </button>
        <button
          className={styles.add}
          aria-label={t('shortcut.newSpace')}
          title={t('shell.spaceBar.newSpaceTitle', { shortcut: `${modKey}⇧N` })}
          onClick={() => editSpace('new')}
          data-testid="new-space"
        >
          <Icon name="plus" size={13} />
        </button>
      </div>
      <div className={styles.actions}>
        <button
          className={`${styles.action} ${downloadsOpen ? styles.actionOn : ''} ${progress !== null ? styles.busy : ''}`}
          aria-label={
            progress !== null
              ? t('shell.spaceBar.downloadsProgress', {
                  pct: new Intl.NumberFormat(t.locale, { style: 'percent' }).format(progress),
                })
              : t('shortcut.downloads')
          }
          title={t('shell.spaceBar.downloadsTitle', { shortcut: `${modKey}⇧J` })}
          onClick={() => setDownloadsOpen(!downloadsOpen)}
          style={{ '--p': `${Math.round((progress ?? 0) * 360)}deg` } as CSSProperties}
          data-testid="downloads-toggle"
        >
          <Icon name="download" size={15} />
        </button>
        <button
          className={styles.action}
          aria-label={t('shortcut.settings')}
          title={t('shortcut.settings')}
          onClick={() => void invoke('tab/openUrl', { input: 'vela://settings', noAtc: true })}
        >
          <Icon name="settings" size={15} />
        </button>
      </div>
    </div>
  );
}
