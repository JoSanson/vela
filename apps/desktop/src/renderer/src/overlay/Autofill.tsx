import type { AutofillPrompt, SavePasswordPrompt } from '@vela/shared';
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { invoke, vela } from '../lib/api';
import { useHoverSelect } from '../lib/hoverSelect';
import styles from './Autofill.module.css';

function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

/** Account picker rendered at the overlay origin: main sizes the overlay view to the popover itself. */
export function AutofillPopover({ initial }: { initial: AutofillPrompt | null }) {
  const [prompt, setPrompt] = useState<AutofillPrompt | null>(initial);
  const [index, setIndex] = useState(0);
  useEffect(() => vela.on('credentials/autofill', (p) => setPrompt(p)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!prompt) return;
      if (e.key === 'ArrowDown') setIndex((i) => (i + 1) % prompt.accounts.length);
      if (e.key === 'ArrowUp') setIndex((i) => (i - 1 + prompt.accounts.length) % prompt.accounts.length);
      if (e.key === 'Enter') {
        const a = prompt.accounts[index];
        if (a) void invoke('credentials/useFill', { tabId: prompt.tabId, id: a.id });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prompt, index]);
  const hover = useHoverSelect(setIndex);
  if (!prompt) return null;
  return (
    <div className={styles.popover} role="listbox" aria-label="Saved logins" data-testid="autofill-popover">
      {prompt.accounts.map((a, i) => (
        <button
          key={a.id}
          role="option"
          aria-selected={i === index}
          className={`${styles.account} ${i === index ? styles.selected : ''}`}
          onMouseMove={(e) => hover(i, e)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void invoke('credentials/useFill', { tabId: prompt.tabId, id: a.id })}
          data-testid="autofill-account"
        >
          <span className={styles.key}>
            <Icon name="key" size={14} />
          </span>
          <span className={styles.text}>
            <span className={styles.user}>{a.username || 'No username'}</span>
            <span className={styles.site}>{hostOf(a.origin)}</span>
          </span>
          <span className={styles.hint}>{i === index ? '↵' : ''}</span>
        </button>
      ))}
    </div>
  );
}

export function SavePasswordView({ initial }: { initial: SavePasswordPrompt | null }) {
  const [prompt, setPrompt] = useState<SavePasswordPrompt | null>(initial);
  useEffect(() => vela.on('credentials/savePrompt', setPrompt), []);
  if (!prompt) return null;
  const respond = (action: 'save' | 'never' | 'dismiss'): void => {
    void invoke('credentials/respond', { id: prompt.id, action });
    setPrompt(null);
  };
  return (
    <div className={styles.save} role="dialog" aria-labelledby="save-pw-title" data-testid="save-password">
      <span className={styles.key}>
        <Icon name="key" size={16} />
      </span>
      <div className={styles.saveText}>
        <div id="save-pw-title" className={styles.saveTitle}>
          {prompt.update ? 'Update password for ' : 'Save password for '}
          <strong>{hostOf(prompt.origin)}</strong>?
        </div>
        {prompt.username && <div className={styles.site}>{prompt.username}</div>}
      </div>
      <div className={styles.saveActions}>
        <button className={styles.ghost} onClick={() => respond('never')} data-testid="save-password-never">
          Never
        </button>
        <button className={styles.ghost} onClick={() => respond('dismiss')} data-testid="save-password-later">
          Not now
        </button>
        <button
          className={styles.primary}
          onClick={() => respond('save')}
          data-testid="save-password-save"
          autoFocus
        >
          {prompt.update ? 'Update' : 'Save'}
        </button>
      </div>
    </div>
  );
}
