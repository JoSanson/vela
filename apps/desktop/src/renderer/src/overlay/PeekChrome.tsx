import { prettyUrl } from '@vela/core';
import type { PeekState } from '@vela/shared';
import { useEffect, useState } from 'react';
import { Favicon } from '../components/Favicon';
import { Icon } from '../components/Icon';
import { invoke, vela } from '../lib/api';
import styles from './PeekChrome.module.css';

/** Toolbar and backdrop drawn around the native Peek view (the view itself sits above the overlay). */
export function PeekChrome() {
  const [peek, setPeek] = useState<PeekState | null>(null);
  useEffect(() => vela.on('peek/changed', setPeek), []);
  if (!peek) return null;
  const { rect } = peek;
  const act = (action: 'close' | 'openAsTab' | 'back' | 'reload'): void =>
    void invoke('peek/action', { action });
  return (
    <div
      className={styles.toolbar}
      style={{ left: rect.x, top: rect.y - 44, width: rect.width }}
      data-testid="peek-toolbar"
    >
      <button className={styles.btn} onClick={() => act('back')} disabled={!peek.canGoBack} aria-label="Back">
        <Icon name="back" size={15} />
      </button>
      <button className={styles.btn} onClick={() => act('reload')} aria-label="Reload">
        <Icon name="reload" size={14} />
      </button>
      <div className={styles.title}>
        <Favicon
          tab={{ favicon: peek.favicon, emoji: null, url: peek.url, sleeping: false, loading: peek.loading }}
          size={14}
        />
        <span className={styles.text}>{peek.title || prettyUrl(peek.url)}</span>
        <span className={styles.url}>{prettyUrl(peek.url)}</span>
      </div>
      <button className={styles.open} onClick={() => act('openAsTab')} data-testid="peek-open">
        <Icon name="external" size={14} />
        Open as tab
      </button>
      <button
        className={styles.btn}
        onClick={() => act('close')}
        aria-label="Close peek"
        data-testid="peek-close"
      >
        <Icon name="close" size={15} />
      </button>
    </div>
  );
}
