import { Icon } from '../components/Icon';
import { invoke } from '../lib/api';
import styles from './UpdateNotes.module.css';

export interface UpdateNotesPayload {
  version: string;
  notes: string | null;
}

export function UpdateNotes({ payload }: { payload: UpdateNotesPayload }) {
  const close = (): void => void invoke('overlay/hide', undefined);
  return (
    <div className={styles.card} role="dialog" aria-label="Update ready" data-testid="update-notes">
      <div className={styles.head}>
        <Icon name="download" size={16} />
        <strong>Vela {payload.version} is ready</strong>
      </div>
      <p className={styles.sub}>It will be installed when you quit. Restart now to update immediately.</p>
      {payload.notes && <pre className={styles.notes}>{payload.notes.replace(/<[^>]+>/g, '')}</pre>}
      <div className={styles.actions}>
        <button className={styles.secondary} onClick={close}>
          Later
        </button>
        <button className={styles.primary} onClick={() => void invoke('update/install', undefined)}>
          Restart to update
        </button>
      </div>
    </div>
  );
}
