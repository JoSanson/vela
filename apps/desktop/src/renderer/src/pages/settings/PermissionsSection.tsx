import type { PermissionKind, SitePermission } from '@vela/shared';
import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { now, tryInvoke } from '../lib';
import { useToast } from '../Toast';
import { Badge, Button, Card, EmptyState, Segmented } from '../ui';
import styles from './Settings.module.css';

const LABEL: Record<PermissionKind, string> = {
  notifications: 'Notifications',
  geolocation: 'Location',
  media: 'Camera & microphone',
  camera: 'Camera',
  microphone: 'Microphone',
  'clipboard-read': 'Read clipboard',
  midi: 'MIDI devices',
  pointerLock: 'Pointer lock',
  fullscreen: 'Full screen',
  'display-capture': 'Screen sharing',
  'idle-detection': 'Idle detection',
  other: 'Other',
};

export function PermissionsSection() {
  const { toast } = useToast();
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

  const change = async (p: SitePermission, decision: 'allow' | 'deny'): Promise<void> => {
    if (decision === p.decision) return;
    const next = { ...p, decision, updatedAt: now() };
    const ok = await tryInvoke('permissions/set', next);
    if (ok === null) return toast("Couldn't update this permission", 'error');
    setItems(
      (prev) => prev?.map((x) => (x.origin === p.origin && x.permission === p.permission ? next : x)) ?? prev,
    );
  };

  const remove = async (p: SitePermission): Promise<void> => {
    const ok = await tryInvoke('permissions/remove', { origin: p.origin, permission: p.permission });
    if (ok === null) return toast("Couldn't remove this permission", 'error');
    setItems(
      (prev) => prev?.filter((x) => !(x.origin === p.origin && x.permission === p.permission)) ?? prev,
    );
    toast(`${p.origin} will ask again for ${LABEL[p.permission].toLowerCase()}`);
  };

  const list = [...(items ?? [])].sort(
    (a, b) => a.origin.localeCompare(b.origin) || a.permission.localeCompare(b.permission),
  );

  return (
    <div className={styles.stack} data-testid="settings-permissions">
      <p className={styles.desc}>
        Decisions you asked Vela to remember. Remove one and the site will ask again next time.
      </p>
      {unavailable && (
        <div className={styles.hintBox}>
          <Icon name="warning" size={14} />
          Permission management isn’t available in this build yet.
        </div>
      )}
      <Card className={styles.section} testId="permissions-table">
        {items === null ? (
          <EmptyState icon="shield" title="Loading…" />
        ) : list.length === 0 ? (
          <EmptyState
            icon="shield"
            title="No saved permissions"
            hint="When a site asks for your camera, location or notifications and you choose to remember the answer, it shows up here."
            testId="permissions-empty"
          />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Site</th>
                <th>Permission</th>
                <th>Decision</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={`${p.origin}|${p.permission}`} data-testid="permission-row">
                  <td className={styles.mono}>{p.origin}</td>
                  <td>
                    <Badge>{LABEL[p.permission] ?? p.permission}</Badge>
                  </td>
                  <td>
                    <Segmented
                      label={`Decision for ${p.origin}`}
                      value={p.decision}
                      options={[
                        { value: 'allow', label: 'Allow' },
                        { value: 'deny', label: 'Block' },
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
                        aria-label="Forget"
                        title="Forget this decision"
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
