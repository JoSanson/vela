import type { ExtensionInfo } from '@vela/shared';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useT } from '../../lib/i18n';
import { tryInvoke } from '../lib';
import { useToast } from '../Toast';
import { Badge, Button, ConfirmButton, EmptyState } from '../ui';
import styles from './Settings.module.css';

export function ExtensionsSection() {
  const { toast } = useToast();
  const t = useT();
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
    if (ext) toast(t('settings.extensions.loaded', { name: ext.name, version: ext.version }));
    else toast(t('settings.extensions.loadError'), 'error');
    await refresh();
  };
  const remove = async (id: string): Promise<void> => {
    await tryInvoke('extensions/remove', { id });
    await refresh();
  };
  const openStore = (): void => {
    void tryInvoke('extensions/openStore', undefined);
  };
  const popup = async (id: string): Promise<void> => {
    const ok = await tryInvoke('extensions/popup', { id });
    if (!ok) toast(t('settings.extensions.noPopup'));
  };

  return (
    <div className={styles.stack} data-testid="settings-extensions">
      <p className={styles.desc}>
        {t('settings.extensions.desc.before')} <code>docs/EXTENSIONS.md</code>
        {t('settings.extensions.desc.after')}
      </p>
      <div className={styles.headActions}>
        <Button variant="primary" icon="puzzle" onClick={openStore} testId="extensions-store">
          {t('settings.extensions.store')}
        </Button>
        <Button icon="plus" onClick={() => void add()} testId="extensions-add">
          {t('settings.extensions.load')}
        </Button>
      </div>
      <p className={styles.desc}>{t('settings.extensions.updates')}</p>
      {list?.length === 0 && (
        <EmptyState
          icon="puzzle"
          title={t('settings.extensions.empty.title')}
          hint={t('settings.extensions.empty.hint')}
          testId="extensions-empty"
        />
      )}
      {list && list.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('settings.extensions.col.extension')}</th>
              <th>{t('settings.extensions.col.version')}</th>
              <th>{t('settings.extensions.col.source')}</th>
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
                {ext.source === 'webstore' ? (
                  <td data-testid="extension-source">{t('settings.extensions.source.webstore')}</td>
                ) : (
                  <td className={styles.mono} title={ext.path} data-testid="extension-source">
                    {ext.path}
                  </td>
                )}
                <td>
                  <div className={styles.cellActions}>
                    <Button size="sm" onClick={() => void popup(ext.id)} testId="extension-popup">
                      {t('settings.extensions.popup')}
                    </Button>
                    <ConfirmButton
                      label={t('common.remove')}
                      confirmLabel={t('common.remove')}
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
