import { Icon } from '../components/Icon';
import { invoke } from '../lib/api';
import { useT } from '../lib/i18n';
import styles from './UpdateNotes.module.css';

export interface UpdateNotesPayload {
  version: string;
  notes: string | null;
}

export function UpdateNotes({ payload }: { payload: UpdateNotesPayload }) {
  const t = useT();
  const close = (): void => void invoke('overlay/hide', undefined);
  return (
    <div
      className={styles.card}
      role="dialog"
      aria-label={t('overlay.updateNotes.ariaLabel')}
      data-testid="update-notes"
    >
      <div className={styles.head}>
        <Icon name="download" size={16} />
        <strong>{t('overlay.updateNotes.ready', { version: payload.version })}</strong>
      </div>
      <p className={styles.sub}>{t('overlay.updateNotes.sub')}</p>
      {payload.notes && <pre className={styles.notes}>{payload.notes.replace(/<[^>]+>/g, '')}</pre>}
      <div className={styles.actions}>
        <button className={styles.secondary} onClick={close}>
          {t('overlay.updateNotes.later')}
        </button>
        <button className={styles.primary} onClick={() => void invoke('update/install', undefined)}>
          {t('overlay.updateNotes.restart')}
        </button>
      </div>
    </div>
  );
}
