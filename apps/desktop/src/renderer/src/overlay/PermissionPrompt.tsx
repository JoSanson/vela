import type { PermissionKind, PermissionPrompt as Prompt } from '@vela/shared';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { invoke, vela } from '../lib/api';
import styles from './PermissionPrompt.module.css';

const LABELS: Record<PermissionKind, { label: string; icon: IconName }> = {
  notifications: { label: 'show notifications', icon: 'warning' },
  geolocation: { label: 'know your location', icon: 'globe' },
  media: { label: 'use your camera and microphone', icon: 'eye' },
  camera: { label: 'use your camera', icon: 'eye' },
  microphone: { label: 'use your microphone', icon: 'audio' },
  'clipboard-read': { label: 'read your clipboard', icon: 'edit' },
  midi: { label: 'access MIDI devices', icon: 'audio' },
  pointerLock: { label: 'lock your pointer', icon: 'expand' },
  fullscreen: { label: 'go full screen', icon: 'expand' },
  'display-capture': { label: 'share your screen', icon: 'window' },
  'idle-detection': { label: 'detect when you are idle', icon: 'sleep' },
  other: { label: 'access a device capability', icon: 'shield' },
};

export function PermissionPromptView({ initial }: { initial: Prompt | null }) {
  const [prompt, setPrompt] = useState<Prompt | null>(initial);
  const [remember, setRemember] = useState(true);
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
          <strong>{host}</strong> wants to {meta.label}
        </div>
        <label className={styles.remember}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember for this site
        </label>
        <div className={styles.actions}>
          <button
            className={styles.deny}
            onClick={() => respond('deny')}
            data-testid="permission-deny"
            autoFocus
          >
            Block
          </button>
          <button className={styles.allow} onClick={() => respond('allow')} data-testid="permission-allow">
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
