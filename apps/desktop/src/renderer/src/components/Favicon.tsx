import { hostOf, type Tab } from '@vela/core';
import { useState, type ReactNode } from 'react';
import { useT } from '../lib/i18n';
import { Icon, type IconName } from './Icon';
import styles from './Favicon.module.css';

interface Props {
  tab: Pick<Tab, 'favicon' | 'emoji' | 'url' | 'loading'>;
  size?: number;
}

let faviconToken = '';

/** Per-launch secret from `snapshot/get`; persisted favicon URLs are tokenless. */
export function setFaviconToken(token: string): void {
  faviconToken = token;
}

const FAVICON_PREFIX = 'vela://favicon/';

const INTERNAL_ICONS: Record<string, IconName> = {
  settings: 'settings',
  history: 'history',
  archive: 'archive',
  downloads: 'download',
  shortcuts: 'keyboard',
  onboarding: 'sparkle',
  error: 'warning',
  reader: 'book',
};

function internalIcon(url: string): IconName {
  const host = url.slice('vela://'.length).split(/[/?#]/)[0] ?? '';
  return INTERNAL_ICONS[host] ?? 'command';
}

export function faviconSrc(url: string): string {
  return url.startsWith(FAVICON_PREFIX)
    ? `${FAVICON_PREFIX}${faviconToken}/${url.slice(FAVICON_PREFIX.length)}`
    : url;
}

export function Favicon({ tab, size = 16 }: Props) {
  const [broken, setBroken] = useState(false);
  const t = useT();
  const style = { width: size, height: size, fontSize: size * 0.75 };
  let inner: ReactNode;
  if (tab.emoji) {
    inner = (
      <span className={styles.emoji} style={style} aria-hidden="true">
        {tab.emoji}
      </span>
    );
  } else if (tab.url.startsWith('vela://')) {
    inner = (
      <span className={styles.badge} style={style} aria-hidden="true">
        <Icon name={internalIcon(tab.url)} size={size - 4} />
      </span>
    );
  } else if (tab.favicon && !broken) {
    inner = (
      <img
        className={styles.img}
        style={style}
        src={faviconSrc(tab.favicon)}
        alt=""
        draggable={false}
        onError={() => setBroken(true)}
      />
    );
  } else {
    const letter = (hostOf(tab.url) || '?').charAt(0).toUpperCase();
    inner = (
      <span className={styles.badge} style={style} aria-hidden="true">
        {letter}
      </span>
    );
  }
  if (!tab.loading) return inner;
  // Loading lives on the icon itself (a ring around a dimmed favicon): the row never shifts.
  return (
    <span
      className={styles.loadingWrap}
      style={{ width: size, height: size }}
      aria-label={t('shell.favicon.loading')}
    >
      {inner}
      <span className={styles.ring} />
    </span>
  );
}
