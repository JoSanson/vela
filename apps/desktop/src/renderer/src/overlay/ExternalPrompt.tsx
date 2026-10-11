import type { ExternalPrompt as Prompt } from '@vela/shared';
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { invoke, vela } from '../lib/api';
import { useT } from '../lib/i18n';
import { emphasize } from './emphasize';
import styles from './AuthPrompt.module.css';

export function ExternalPromptView({ initial }: { initial: Prompt | null }) {
  const [prompt, setPrompt] = useState<Prompt | null>(initial);
  const [remember, setRemember] = useState(false);
  const t = useT();
  useEffect(() => vela.on('external/prompt', setPrompt), []);
  if (!prompt) return null;
  const scheme = `${prompt.scheme}:`;
  const respond = (allow: boolean): void => {
    void invoke('external/respond', { id: prompt.id, allow, remember });
    setPrompt(null);
  };
  return (
    <div className={styles.card} role="alertdialog" aria-labelledby="ext-title" data-testid="external-prompt">
      <div className={styles.icon}>
        <Icon name="external" size={20} />
      </div>
      <div className={styles.body}>
        <div id="ext-title" className={styles.title}>
          {emphasize(t('overlay.external.title', { scheme }), scheme)}
        </div>
        <div className={styles.realm}>{prompt.host || prompt.url.slice(0, 80)}</div>
        <label className={styles.remember}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {t('overlay.external.always', { scheme })}
        </label>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => respond(false)}
            data-testid="external-deny"
            autoFocus
          >
            {t('overlay.external.stay')}
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => respond(true)}
            data-testid="external-open"
          >
            {t('common.open')}
          </button>
        </div>
      </div>
    </div>
  );
}
