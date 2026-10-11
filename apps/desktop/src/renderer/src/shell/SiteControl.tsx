import { hostOf, originOf, prettyUrl, type Tab } from '@vela/core';
import type { BlockerStats, Boost, SitePermission } from '@vela/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Favicon } from '../components/Favicon';
import { Icon } from '../components/Icon';
import { invoke } from '../lib/api';
import { useT } from '../lib/i18n';
import { useShell } from '../lib/store';
import styles from './SiteControl.module.css';

/** Per-site control center anchored under the URL pill: blocker, zoom, permissions, boosts, profile. */
export function SiteControl({ tab, onClose }: { tab: Tab; onClose: () => void }) {
  const core = useShell((s) => s.core);
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<BlockerStats | null>(null);
  const [perms, setPerms] = useState<SitePermission[]>([]);
  const [boosts, setBoosts] = useState<Boost[]>([]);
  const host = hostOf(tab.url);
  const origin = originOf(tab.url);
  const secure = !tab.certWarning && (tab.url.startsWith('https://') || tab.url.startsWith('vela://'));
  const space = tab.spaceId ? core.spaces[tab.spaceId] : core.spaces[core.activeSpaceId];
  const profile = space?.profileId ? core.profiles[space.profileId] : null;
  const percent = new Intl.NumberFormat(t.locale, { style: 'percent' });

  const load = useCallback(
    (): Promise<void> =>
      Promise.all([
        invoke('blocker/stats', { tabId: tab.id }).catch(() => null),
        invoke('permissions/list', undefined).catch(() => [] as SitePermission[]),
        invoke('boosts/list', undefined).catch(() => [] as Boost[]),
      ]).then(([s, p, b]) => {
        setStats(s);
        setPerms(p.filter((x) => x.origin === origin));
        setBoosts(b.filter((x) => x.host === host));
      }),
    [tab.id, origin, host],
  );
  useEffect(() => {
    void load();
  }, [load]);

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

  const zoom = async (next: number): Promise<void> => {
    await invoke('tab/setZoom', { tabId: tab.id, zoom: next });
  };
  const toggleBlocker = async (): Promise<void> => {
    if (!stats) return;
    await invoke('blocker/setHost', { host, enabled: !stats.enabledForHost });
    await invoke('tab/reload', { tabId: tab.id });
    await load();
  };
  const openSettings = (hash: string): void => {
    void invoke('tab/openUrl', { input: `vela://settings/#${hash}`, noAtc: true });
    onClose();
  };

  return (
    <div
      ref={ref}
      className={styles.panel}
      role="dialog"
      aria-label={t('shell.siteControl.title')}
      data-testid="site-control"
    >
      <div className={styles.head}>
        <Favicon tab={tab} size={18} />
        <div className={styles.headText}>
          <div className={styles.host}>{host || prettyUrl(tab.url)}</div>
          <div className={`${styles.secure} ${secure ? '' : styles.insecure}`}>
            <Icon name="shield" size={11} />
            {tab.url.startsWith('vela://')
              ? t('shell.siteControl.velaPage')
              : tab.certWarning
                ? t('shell.siteControl.certNotTrusted')
                : secure
                  ? t('shell.siteControl.secure')
                  : t('shell.siteControl.notSecure')}
          </div>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.label}>
          <Icon name="shield" size={14} />
          <span>{t('shell.siteControl.blockAds')}</span>
          {stats && stats.blockedOnTab > 0 && (
            <span className={styles.count} data-testid="site-blocked-count">
              {t('shell.siteControl.blockedCount', { n: stats.blockedOnTab })}
            </span>
          )}
        </div>
        <button
          role="switch"
          aria-checked={!!stats?.enabledForHost}
          className={`${styles.switch} ${stats?.enabledForHost ? styles.on : ''}`}
          onClick={() => void toggleBlocker()}
          disabled={!stats?.enabled}
          data-testid="site-blocker-toggle"
        >
          <span />
        </button>
      </div>

      <div className={styles.row}>
        <div className={styles.label}>
          <Icon name="search" size={14} />
          <span>{t('shell.siteControl.zoom')}</span>
        </div>
        <div className={styles.zoom}>
          <button onClick={() => void zoom(tab.zoom - 0.1)} aria-label={t('shortcut.zoomOut')}>
            −
          </button>
          <button
            className={styles.zoomValue}
            onClick={() => void zoom(1)}
            title={t('shortcut.zoomReset')}
            data-testid="site-zoom"
          >
            {percent.format(tab.zoom)}
          </button>
          <button onClick={() => void zoom(tab.zoom + 0.1)} aria-label={t('shortcut.zoomIn')}>
            +
          </button>
        </div>
      </div>

      {perms.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <span>{t('shell.siteControl.permissions')}</span>
            <button className={styles.link} onClick={() => openSettings('permissions')}>
              {t('shell.siteControl.manage')}
            </button>
          </div>
          {perms.map((p) => (
            <div key={p.permission} className={styles.perm} data-testid="site-permission">
              <span>{t(`shell.siteControl.permission.${p.permission}`)}</span>
              <span className={`${styles.pill} ${p.decision === 'allow' ? styles.allow : styles.deny}`}>
                {p.decision === 'allow' ? t('shell.siteControl.allowed') : t('shell.siteControl.blocked')}
              </span>
              <button
                className={styles.link}
                onClick={() =>
                  void invoke('permissions/remove', { origin: p.origin, permission: p.permission }).then(load)
                }
              >
                {t('shell.siteControl.forget')}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <span>{t('shell.siteControl.thisPage')}</span>
          <button className={styles.link} onClick={() => openSettings('boosts')}>
            {t('shell.siteControl.boosts')}
          </button>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.action}
            onClick={() =>
              void invoke('command/run', { id: 'zap', payload: { tabId: tab.id } }).then(onClose)
            }
            data-testid="site-zap"
          >
            <Icon name="zap" size={13} /> {t('shell.siteControl.zapElement')}
          </button>
          <button
            className={styles.action}
            onClick={() => void invoke('command/run', { id: 'readerMode' }).then(onClose)}
            data-testid="site-reader"
          >
            <Icon name="book" size={13} /> {t('shell.siteControl.reader')}
          </button>
        </div>
        {boosts.length > 0 && (
          <p className={styles.muted}>
            {t('shell.siteControl.boostsSummary', {
              boosts: boosts.length,
              zapped: boosts.reduce((n, b) => n + b.zapped.length, 0),
            })}
          </p>
        )}
      </div>

      <div className={styles.foot}>
        <span className={styles.muted}>
          {space?.emoji} {space?.name} ·{' '}
          {profile
            ? t('shell.siteControl.profile', { name: profile.name })
            : t('shell.siteControl.defaultProfile')}
        </span>
        {perms.length === 0 && (
          <button className={styles.link} onClick={() => openSettings('permissions')}>
            {t('shell.siteControl.permissions')}
          </button>
        )}
      </div>
    </div>
  );
}
