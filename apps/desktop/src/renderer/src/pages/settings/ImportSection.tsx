import { useState } from 'react';
import { ImportPanel } from '../ImportPanel';
import { tryInvoke, useSnapshot } from '../lib';
import { useToast } from '../Toast';
import { Button, Card, Row, Spinner } from '../ui';
import styles from './Settings.module.css';

export function ImportSection() {
  const { toast } = useToast();
  const { refresh } = useSnapshot();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const exportAll = async (): Promise<void> => {
    setBusy('export');
    const path = await tryInvoke('export/saveToFile', undefined);
    setBusy(null);
    if (path === null) return toast("Couldn't export your data", 'error');
    if (path) toast(`Saved to ${path}`);
  };

  const importFile = async (): Promise<void> => {
    setBusy('import');
    const ok = await tryInvoke('import/fromFile', undefined);
    setBusy(null);
    if (ok === null) return toast("Couldn't import this file", 'error');
    if (ok) {
      toast('Data imported');
      await refresh();
    }
  };

  return (
    <div className={styles.stack} data-testid="settings-import">
      <p className={styles.h3}>From another browser</p>
      <Card className={styles.section}>
        <ImportPanel onImported={() => void refresh()} />
      </Card>

      <p className={styles.h3}>Vela data</p>
      <Card>
        <Row
          label="Export all data"
          hint="Spaces, tabs, folders, rules, archive and preferences as a single JSON file."
        >
          <Button
            variant="secondary"
            icon="upload"
            testId="export-state"
            disabled={busy !== null}
            onClick={() => void exportAll()}
          >
            {busy === 'export' ? <Spinner /> : null}
            Export…
          </Button>
        </Row>
        <Row label="Import from file" hint="Restore a Vela export. Current spaces and tabs are replaced.">
          <Button
            variant="secondary"
            icon="download"
            testId="import-state"
            disabled={busy !== null}
            onClick={() => void importFile()}
          >
            {busy === 'import' ? <Spinner /> : null}
            Import…
          </Button>
        </Row>
      </Card>
    </div>
  );
}
