import type { AutofillPrompt, SavePasswordPrompt } from '@vela/shared';
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { invoke, vela } from '../lib/api';
import { useHoverSelect } from '../lib/hoverSelect';
import { useT } from '../lib/i18n';
import { emphasize } from './emphasize';
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
  const t = useT();
  useEffect(() => vela.on('credentials/autofill', (p) => setPrompt(p)), []);
  // The page keeps keyboard focus: its preload forwards the navigation keys while we are open.
  useEffect(() => {
    const onKey = (key: string): void => {
      if (!prompt) return;
      const n = prompt.accounts.length;
      if (key === 'ArrowDown') setIndex((i) => (Math.min(i, n - 1) + 1) % n);
      if (key === 'ArrowUp') setIndex((i) => (Math.min(i, n - 1) - 1 + n) % n);
      if (key === 'Enter') {
        const a = prompt.accounts[Math.min(index, n - 1)];
        if (a) void invoke('credentials/useFill', { tabId: prompt.tabId, id: a.id });
      }
    };
    const off = vela.on('credentials/autofillKey', onKey);
    const onLocal = (e: KeyboardEvent): void => onKey(e.key);
    window.addEventListener('keydown', onLocal);
    return () => {
      off();
      window.removeEventListener('keydown', onLocal);
    };
  }, [prompt, index]);
  const hover = useHoverSelect(setIndex);
  if (!prompt) return null;
  const selected = Math.min(index, prompt.accounts.length - 1);
  return (
    <div
      className={styles.popover}
      role="listbox"
      aria-label={t('overlay.autofill.savedLogins')}
      data-testid="autofill-popover"
    >
      {prompt.accounts.map((a, i) => (
        <button
          key={a.id}
          role="option"
          aria-selected={i === selected}
          className={`${styles.account} ${i === selected ? styles.selected : ''}`}
          onMouseMove={(e) => hover(i, e)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void invoke('credentials/useFill', { tabId: prompt.tabId, id: a.id })}
          data-testid="autofill-account"
        >
          <span className={styles.key}>
            <Icon name="key" size={14} />
          </span>
          <span className={styles.text}>
            <span className={styles.user}>{a.username || t('overlay.autofill.noUsername')}</span>
            <span className={styles.site}>{hostOf(a.origin)}</span>
          </span>
          <span className={styles.hint}>{i === selected ? '↵' : ''}</span>
        </button>
      ))}
    </div>
  );
}

export function SavePasswordView({ initial }: { initial: SavePasswordPrompt | null }) {
  const [prompt, setPrompt] = useState<SavePasswordPrompt | null>(initial);
  const t = useT();
  useEffect(() => vela.on('credentials/savePrompt', setPrompt), []);
  if (!prompt) return null;
  const host = hostOf(prompt.origin);
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
          {emphasize(
            t(prompt.update ? 'overlay.savePassword.updateTitle' : 'overlay.savePassword.saveTitle', {
              host,
            }),
            host,
          )}
        </div>
        {prompt.username && <div className={styles.site}>{prompt.username}</div>}
      </div>
      <div className={styles.saveActions}>
        <button className={styles.ghost} onClick={() => respond('never')} data-testid="save-password-never">
          {t('overlay.savePassword.never')}
        </button>
        <button className={styles.ghost} onClick={() => respond('dismiss')} data-testid="save-password-later">
          {t('overlay.savePassword.notNow')}
        </button>
        <button
          className={styles.primary}
          onClick={() => respond('save')}
          data-testid="save-password-save"
          autoFocus
        >
          {prompt.update ? t('overlay.savePassword.update') : t('common.save')}
        </button>
      </div>
    </div>
  );
}
