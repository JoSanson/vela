import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { invoke, vela } from '../lib/api';
import { selectActiveTab, useShell } from '../lib/store';
import styles from './FindBar.module.css';

export function FindBar({ onClose }: { onClose: () => void }) {
  const tab = useShell(selectActiveTab);
  const [text, setText] = useState('');
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
    void invoke('tab/find', { tabId, text, forward: true, findNext: false });
  }, [text, tabId]);

  const step = (forward: boolean): void => {
    if (tabId && text) void invoke('tab/find', { tabId, text, forward, findNext: true });
  };
  const close = (): void => {
    if (tabId) void invoke('tab/stopFind', { tabId, action: 'keepSelection' });
    onClose();
  };

  return (
    <div className={styles.bar} role="search" aria-label="Find in page" data-testid="find-bar">
      <Icon name="search" size={14} className={styles.icon} />
      <input
        ref={inputRef}
        className={styles.input}
        value={text}
        placeholder="Find in page"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') step(!e.shiftKey);
          if (e.key === 'Escape') close();
        }}
        data-testid="find-input"
      />
      <span className={styles.count} data-testid="find-count">
        {text ? (result?.text === text ? `${result.active}/${result.total}` : '…') : ''}
      </span>
      <button className={styles.btn} onClick={() => step(false)} aria-label="Previous match">
        <Icon name="back" size={14} style={{ transform: 'rotate(90deg)' }} />
      </button>
      <button className={styles.btn} onClick={() => step(true)} aria-label="Next match">
        <Icon name="back" size={14} style={{ transform: 'rotate(-90deg)' }} />
      </button>
      <button className={styles.btn} onClick={close} aria-label="Close find bar">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
