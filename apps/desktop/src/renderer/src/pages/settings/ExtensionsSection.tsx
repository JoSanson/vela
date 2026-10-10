import type { ExtensionInfo } from '@vela/shared';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { tryInvoke } from '../lib';
import { useToast } from '../Toast';
import { Badge, Button, ConfirmButton, EmptyState } from '../ui';
import styles from './Settings.module.css';

export function ExtensionsSection() {
  const { toast } = useToast();
  const [list, setList] = useState<ExtensionInfo[] | null>(null);
  const refresh = useCallback(
    (): Promise<void> => tryInvoke('extensions/list', undefined).then((r) => setList(r ?? [])),
    [],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = async (): Promise<void> => {
    const ext = await tryInvoke('extensions/load', {});
    if (ext) toast(`Loaded ${ext.name} ${ext.version}`);
    else toast('No extension loaded — pick a folder containing manifest.json', 'error');
    await refresh();
  };
  const remove = async (id: string): Promise<void> => {
    await tryInvoke('extensions/remove', { id });
    await refresh();
  };
  const popup = async (id: string): Promise<void> => {
    const ok = await tryInvoke('extensions/popup', { id });
    if (!ok) toast('This extension has no popup');
  };

  return (
    <div className={styles.stack} data-testid="settings-extensions">
      <p className={styles.desc}>
        Load unpacked Chrome extensions (Manifest V3). Content scripts, service workers, storage, popups and
        most runtime APIs work; the exact subset is documented in <code>docs/EXTENSIONS.md</code>. Extensions
        apply to every space and profile.
      </p>
      <div className={styles.headActions}>
        <Button variant="primary" icon="plus" onClick={() => void add()} testId="extensions-add">
          Load unpacked…
        </Button>
      </div>
      {list?.length === 0 && (
        <EmptyState
          icon="puzzle"
          title="No extensions"
          hint="Pick a folder that contains a manifest.json."
          testId="extensions-empty"
        />
      )}
      {list && list.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Extension</th>
              <th>Version</th>
              <th>Folder</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((ext) => (
              <tr key={ext.id} data-testid="extension-row">
                <td>
                  <Icon name="puzzle" size={14} /> {ext.name}
                </td>
                <td>
                  <Badge>{ext.version}</Badge>
                </td>
                <td className={styles.mono} title={ext.path}>
                  {ext.path}
                </td>
                <td>
                  <div className={styles.cellActions}>
                    <Button size="sm" onClick={() => void popup(ext.id)} testId="extension-popup">
                      Popup
                    </Button>
                    <ConfirmButton
                      label="Remove"
                      confirmLabel="Remove"
                      size="sm"
                      onConfirm={() => void remove(ext.id)}
                      testId="extension-remove"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
