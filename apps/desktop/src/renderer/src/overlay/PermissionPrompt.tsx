import type { MessageKey, PermissionKind, PermissionPrompt as Prompt } from '@vela/shared';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { invoke, vela } from '../lib/api';
import { useT } from '../lib/i18n';
import { emphasize } from './emphasize';
import styles from './PermissionPrompt.module.css';

const LABELS: Record<PermissionKind, { label: MessageKey; icon: IconName }> = {
  notifications: { label: 'overlay.permission.kind.notifications', icon: 'warning' },
  geolocation: { label: 'overlay.permission.kind.geolocation', icon: 'globe' },
  media: { label: 'overlay.permission.kind.media', icon: 'eye' },
  camera: { label: 'overlay.permission.kind.camera', icon: 'eye' },
  microphone: { label: 'overlay.permission.kind.microphone', icon: 'audio' },
  'clipboard-read': { label: 'overlay.permission.kind.clipboardRead', icon: 'edit' },
  midi: { label: 'overlay.permission.kind.midi', icon: 'audio' },
  pointerLock: { label: 'overlay.permission.kind.pointerLock', icon: 'expand' },
  fullscreen: { label: 'overlay.permission.kind.fullscreen', icon: 'expand' },
  'display-capture': { label: 'overlay.permission.kind.displayCapture', icon: 'window' },
  'idle-detection': { label: 'overlay.permission.kind.idleDetection', icon: 'sleep' },
  other: { label: 'overlay.permission.kind.other', icon: 'shield' },
};

export function PermissionPromptView({ initial }: { initial: Prompt | null }) {
  const [prompt, setPrompt] = useState<Prompt | null>(initial);
  const [remember, setRemember] = useState(true);
  const t = useT();
  useEffect(() => vela.on('permissions/prompt', setPrompt), []);
  if (!prompt) return null;
  const meta = LABELS[prompt.permission];
  const respond = (decision: 'allow' | 'deny'): void => {
    void invoke('permissions/respond', { id: prompt.id, decision, remember });
    setPrompt(null);
  };
  let host = prompt.origin;
  try {
    host = new URL(prompt.origin).host;
  } catch {
    /* keep origin */
  }
  return (
    <div
      className={styles.card}
      role="alertdialog"
      aria-labelledby="perm-title"
      data-testid="permission-prompt"
    >
      <div className={styles.icon}>
        <Icon name={meta.icon} size={20} />
      </div>
      <div className={styles.body}>
        <div id="perm-title" className={styles.title}>
          {emphasize(t('overlay.permission.title', { host, capability: t(meta.label) }), host)}
        </div>
        <label className={styles.remember}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {t('overlay.permission.remember')}
        </label>
        <div className={styles.actions}>
          <button
            className={styles.deny}
            onClick={() => respond('deny')}
            data-testid="permission-deny"
            autoFocus
          >
            {t('overlay.permission.block')}
          </button>
          <button className={styles.allow} onClick={() => respond('allow')} data-testid="permission-allow">
            {t('overlay.permission.allow')}
          </button>
        </div>
      </div>
    </div>
  );
}
