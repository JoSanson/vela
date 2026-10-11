import { useState } from 'react';
import { useT } from '../../lib/i18n';
import { ImportPanel } from '../ImportPanel';
import { tryInvoke, useSnapshot } from '../lib';
import { useToast } from '../Toast';
import { Button, Card, Row, Spinner } from '../ui';
import styles from './Settings.module.css';

export function ImportSection() {
  const { toast } = useToast();
  const { refresh } = useSnapshot();
  const t = useT();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const exportAll = async (): Promise<void> => {
    setBusy('export');
    const path = await tryInvoke('export/saveToFile', undefined);
    setBusy(null);
    if (path === null) return toast(t('settings.import.exportError'), 'error');
    if (path) toast(t('settings.import.savedTo', { path }));
  };

  const importFile = async (): Promise<void> => {
    setBusy('import');
    const ok = await tryInvoke('import/fromFile', undefined);
    setBusy(null);
    if (ok === null) return toast(t('settings.import.importError'), 'error');
    if (ok) {
      toast(t('settings.import.imported'));
      await refresh();
    }
  };

  return (
    <div className={styles.stack} data-testid="settings-import">
      <p className={styles.h3}>{t('settings.import.fromBrowser')}</p>
      <Card className={styles.section}>
        <ImportPanel onImported={() => void refresh()} />
      </Card>

      <p className={styles.h3}>{t('settings.import.velaData')}</p>
      <Card>
        <Row label={t('settings.import.export.label')} hint={t('settings.import.export.hint')}>
          <Button
            variant="secondary"
            icon="upload"
            testId="export-state"
            disabled={busy !== null}
            onClick={() => void exportAll()}
          >
            {busy === 'export' ? <Spinner /> : null}
            {t('settings.import.export.button')}
          </Button>
        </Row>
        <Row label={t('settings.import.import.label')} hint={t('settings.import.import.hint')}>
          <Button
            variant="secondary"
            icon="download"
            testId="import-state"
            disabled={busy !== null}
            onClick={() => void importFile()}
          >
            {busy === 'import' ? <Spinner /> : null}
            {t('settings.import.import.button')}
          </Button>
        </Row>
      </Card>
    </div>
  );
}
