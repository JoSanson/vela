import type { MessageKey, PermissionKind, SitePermission } from '@vela/shared';
import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useT } from '../../lib/i18n';
import { now, tryInvoke } from '../lib';
import { useToast } from '../Toast';
import { Badge, Button, Card, EmptyState, Segmented } from '../ui';
import styles from './Settings.module.css';

const LABEL_KEY: Record<PermissionKind, MessageKey> = {
  notifications: 'settings.permissions.kind.notifications',
  geolocation: 'settings.permissions.kind.geolocation',
  media: 'settings.permissions.kind.media',
  camera: 'settings.permissions.kind.camera',
  microphone: 'settings.permissions.kind.microphone',
  'clipboard-read': 'settings.permissions.kind.clipboardRead',
  midi: 'settings.permissions.kind.midi',
  pointerLock: 'settings.permissions.kind.pointerLock',
  fullscreen: 'settings.permissions.kind.fullscreen',
  'display-capture': 'settings.permissions.kind.displayCapture',
  'idle-detection': 'settings.permissions.kind.idleDetection',
  other: 'settings.permissions.kind.other',
};

export function PermissionsSection() {
  const { toast } = useToast();
  const t = useT();
  const [items, setItems] = useState<SitePermission[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void tryInvoke('permissions/list', undefined).then((res) => {
      if (cancelled) return;
      if (res === null) setUnavailable(true);
      setItems(res ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const label = (kind: PermissionKind): string => {
    const key = LABEL_KEY[kind] as MessageKey | undefined;
    return key ? t(key) : kind;
  };

  const change = async (p: SitePermission, decision: 'allow' | 'deny'): Promise<void> => {
    if (decision === p.decision) return;
    const next = { ...p, decision, updatedAt: now() };
    const ok = await tryInvoke('permissions/set', next);
    if (ok === null) return toast(t('settings.permissions.updateError'), 'error');
    setItems(
      (prev) => prev?.map((x) => (x.origin === p.origin && x.permission === p.permission ? next : x)) ?? prev,
    );
  };

  const remove = async (p: SitePermission): Promise<void> => {
    const ok = await tryInvoke('permissions/remove', { origin: p.origin, permission: p.permission });
    if (ok === null) return toast(t('settings.permissions.removeError'), 'error');
    setItems(
      (prev) => prev?.filter((x) => !(x.origin === p.origin && x.permission === p.permission)) ?? prev,
    );
    toast(
      t('settings.permissions.askAgain', {
        origin: p.origin,
        permission: label(p.permission).toLocaleLowerCase(t.locale),
      }),
    );
  };

  const list = [...(items ?? [])].sort(
    (a, b) => a.origin.localeCompare(b.origin) || a.permission.localeCompare(b.permission),
  );

  return (
    <div className={styles.stack} data-testid="settings-permissions">
      <p className={styles.desc}>{t('settings.permissions.desc')}</p>
      {unavailable && (
        <div className={styles.hintBox}>
          <Icon name="warning" size={14} />
          {t('settings.permissions.unavailable')}
        </div>
      )}
      <Card className={styles.section} testId="permissions-table">
        {items === null ? (
          <EmptyState icon="shield" title={t('common.loading')} />
        ) : list.length === 0 ? (
          <EmptyState
            icon="shield"
            title={t('settings.permissions.empty.title')}
            hint={t('settings.permissions.empty.hint')}
            testId="permissions-empty"
          />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('settings.permissions.col.site')}</th>
                <th>{t('settings.permissions.col.permission')}</th>
                <th>{t('settings.permissions.col.decision')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={`${p.origin}|${p.permission}`} data-testid="permission-row">
                  <td className={styles.mono}>{p.origin}</td>
                  <td>
                    <Badge>{label(p.permission)}</Badge>
                  </td>
                  <td>
                    <Segmented
                      label={t('settings.permissions.decisionFor', { origin: p.origin })}
                      value={p.decision}
                      options={[
                        { value: 'allow', label: t('settings.permissions.allow') },
                        { value: 'deny', label: t('settings.permissions.block') },
                      ]}
                      onChange={(v) => void change(p, v)}
                      testId="permission-decision"
                    />
                  </td>
                  <td>
                    <div className={styles.cellActions}>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        aria-label={t('settings.permissions.forget')}
                        title={t('settings.permissions.forgetTitle')}
                        testId="permission-remove"
                        onClick={() => void remove(p)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
