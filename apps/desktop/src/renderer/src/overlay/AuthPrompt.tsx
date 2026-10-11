import type { AuthPrompt as Prompt } from '@vela/shared';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { invoke, vela } from '../lib/api';
import { useT } from '../lib/i18n';
import { emphasize } from './emphasize';
import styles from './AuthPrompt.module.css';

export function AuthPromptView({ initial }: { initial: Prompt | null }) {
  const [prompt, setPrompt] = useState<Prompt | null>(initial);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const userRef = useRef<HTMLInputElement>(null);
  const t = useT();
  useEffect(() => vela.on('auth/prompt', setPrompt), []);
  useEffect(() => {
    userRef.current?.focus();
  }, [prompt?.id]);
  if (!prompt) return null;
  const submit = (): void => {
    void invoke('auth/respond', { id: prompt.id, username, password });
    setPrompt(null);
    setUsername('');
    setPassword('');
  };
  const cancel = (): void => {
    void invoke('auth/respond', { id: prompt.id, username: null, password: null });
    setPrompt(null);
  };
  return (
    <form
      className={styles.card}
      role="dialog"
      aria-labelledby="auth-title"
      data-testid="auth-prompt"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className={styles.icon}>
        <Icon name="shield" size={20} />
      </div>
      <div className={styles.body}>
        <div id="auth-title" className={styles.title}>
          {emphasize(
            t(prompt.isProxy ? 'overlay.auth.titleProxy' : 'overlay.auth.title', { host: prompt.host }),
            prompt.host,
          )}
        </div>
        {prompt.realm && <div className={styles.realm}>{prompt.realm}</div>}
        <input
          ref={userRef}
          className={styles.input}
          placeholder={t('overlay.auth.username')}
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          data-testid="auth-username"
        />
        <input
          className={styles.input}
          type="password"
          placeholder={t('overlay.auth.password')}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="auth-password"
        />
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={cancel} data-testid="auth-cancel">
            {t('common.cancel')}
          </button>
          <button type="submit" className={styles.primary} data-testid="auth-submit">
            {t('overlay.auth.signIn')}
          </button>
        </div>
      </div>
    </form>
  );
}
