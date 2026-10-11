import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { invoke, vela } from '../lib/api';
import { useT } from '../lib/i18n';
import { selectActiveTab, useShell } from '../lib/store';
import styles from './FindBar.module.css';

export function FindBar({ onClose }: { onClose: () => void }) {
  const tab = useShell(selectActiveTab);
  const t = useT();
  const [text, setText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [result, setResult] = useState<{ active: number; total: number; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tabId = tab?.id;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    return vela.on('find/result', (r) => {
      if (r.tabId === tabId) setResult({ active: r.activeMatchOrdinal, total: r.matches, text });
    });
  }, [tabId, text]);

  useEffect(() => {
    if (!tabId) return;
    if (!text) {
      void invoke('tab/stopFind', { tabId, action: 'clearSelection' });
      return;
    }
    void invoke('tab/find', { tabId, text, forward: true, findNext: false, matchCase });
  }, [text, tabId, matchCase]);

  const step = (forward: boolean): void => {
    if (tabId && text) void invoke('tab/find', { tabId, text, forward, findNext: true, matchCase });
  };
  const close = (): void => {
    if (tabId) void invoke('tab/stopFind', { tabId, action: 'keepSelection' });
    onClose();
  };

  return (
    <div
      className={styles.bar}
      role="search"
      aria-label={t('shell.findBar.findInPage')}
      data-testid="find-bar"
    >
      <Icon name="search" size={14} className={styles.icon} />
      <input
        ref={inputRef}
        className={styles.input}
        value={text}
        placeholder={t('shell.findBar.findInPage')}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') step(!e.shiftKey);
          if (e.key === 'Escape') close();
        }}
        data-testid="find-input"
      />
      <button
        className={`${styles.btn} ${styles.toggle} ${matchCase ? styles.toggleOn : ''}`}
        onClick={() => setMatchCase((v) => !v)}
        aria-pressed={matchCase}
        aria-label={t('shell.findBar.matchCase')}
        title={t('shell.findBar.matchCase')}
        data-testid="find-match-case"
      >
        Aa
      </button>
      <span className={styles.count} data-testid="find-count">
        {text
          ? result?.text === text
            ? t('shell.findBar.count', { active: result.active, total: result.total })
            : '…'
          : ''}
      </span>
      <button className={styles.btn} onClick={() => step(false)} aria-label={t('shell.findBar.previous')}>
        <Icon name="back" size={14} style={{ transform: 'rotate(90deg)' }} />
      </button>
      <button className={styles.btn} onClick={() => step(true)} aria-label={t('shell.findBar.next')}>
        <Icon name="back" size={14} style={{ transform: 'rotate(-90deg)' }} />
      </button>
      <button className={styles.btn} onClick={close} aria-label={t('shell.findBar.close')}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
