import type { UpdateStatus } from '@vela/shared';
import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { tryInvoke, useEvent, useSnapshot } from '../lib';
import { useToast } from '../Toast';
import { Badge, Button, Card } from '../ui';
import styles from './Settings.module.css';

function versionOf(token: string): string {
  const m = new RegExp(`${token}/(\\S+)`).exec(navigator.userAgent);
  return m?.[1] ?? 'unknown';
}

function describe(
  s: UpdateStatus | null,
  auto: boolean,
): { title: string; sub: string; tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' } {
  if (!s)
    return { title: 'Updates unavailable', sub: 'This build cannot check for updates.', tone: 'neutral' };
  switch (s.state) {
    case 'checking':
      return { title: 'Checking for updates…', sub: 'Contacting the release server.', tone: 'accent' };
    case 'available':
      return {
        title: `Version ${s.version ?? ''} available`,
        sub: auto ? 'Downloading in the background.' : 'Ready to download.',
        tone: 'accent',
      };
    case 'downloading':
      return {
        title: `Downloading ${s.version ?? 'update'}…`,
        sub: `${Math.round(s.progress)}% done`,
        tone: 'accent',
      };
    case 'downloaded':
      return {
        title: `Version ${s.version ?? ''} is ready`,
        sub: 'Restart Vela to finish installing.',
        tone: 'success',
      };
    case 'error':
      return { title: 'Update failed', sub: s.error ?? 'Unknown error.', tone: 'danger' };
    case 'up-to-date':
      return { title: 'Vela is up to date', sub: 'You have the latest version.', tone: 'success' };
    default:
      return { title: 'Updates', sub: 'Check for a newer version of Vela.', tone: 'neutral' };
  }
}

export function AboutSection() {
  const { snap } = useSnapshot();
  const { toast } = useToast();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void tryInvoke('update/status', undefined).then((res) => {
      if (cancelled) return;
      if (res === null) setUnavailable(true);
      setStatus(res);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEvent('update/changed', (s) => {
    setStatus(s);
    setUnavailable(false);
  });

  const check = async (): Promise<void> => {
    setChecking(true);
    const res = await tryInvoke('update/check', undefined);
    setChecking(false);
    if (res === null) return toast("Couldn't check for updates", 'error');
    setStatus(res);
  };

  const install = async (): Promise<void> => {
    const ok = await tryInvoke('update/install', undefined);
    if (ok === null) toast("Couldn't restart to update", 'error');
  };

  const info = describe(unavailable ? null : status, snap?.prefs.autoUpdate ?? true);
  const version = snap?.version ?? versionOf('Vela');
  const platformLabel =
    snap?.platform === 'darwin' ? 'macOS' : snap?.platform === 'win32' ? 'Windows' : 'Linux';

  return (
    <div className={styles.stack} data-testid="settings-about">
      <Card>
        <div className={styles.brand}>
          <span className={styles.brandLogo}>
            <Icon name="command" size={24} />
          </span>
          <div>
            <div className={styles.brandName}>
              Vela <Badge>v{version}</Badge>
            </div>
            <div className={styles.brandSub}>An Arc-inspired browser built on Chromium. MIT licensed.</div>
          </div>
        </div>
        <dl className={styles.aboutGrid} style={{ borderTop: '1px solid var(--p-border)' }}>
          <dt>Vela</dt>
          <dd data-testid="about-version">{version}</dd>
          <dt>Chromium</dt>
          <dd>{versionOf('Chrome')}</dd>
          {versionOf('Electron') !== 'unknown' && (
            <>
              <dt>Electron</dt>
              <dd>{versionOf('Electron')}</dd>
            </>
          )}
          <dt>Platform</dt>
          <dd>{platformLabel}</dd>
        </dl>
      </Card>

      <p className={styles.h3}>Updates</p>
      <Card testId="about-updates">
        <div className={styles.updateRow}>
          <div className={styles.updateText}>
            <span>
              {info.title}{' '}
              {info.tone !== 'neutral' && (
                <Badge tone={info.tone}>
                  {status?.state === 'up-to-date' ? 'Latest' : (status?.state ?? '')}
                </Badge>
              )}
            </span>
            <span className={styles.updateSub}>{info.sub}</span>
          </div>
          <div className={styles.headActions}>
            {status?.state === 'downloaded' ? (
              <Button variant="primary" icon="reload" testId="update-install" onClick={() => void install()}>
                Restart to update
              </Button>
            ) : (
              <Button
                variant="secondary"
                icon="reload"
                testId="update-check"
                disabled={
                  checking || unavailable || status?.state === 'checking' || status?.state === 'downloading'
                }
                onClick={() => void check()}
              >
                {checking ? 'Checking…' : 'Check for updates'}
              </Button>
            )}
          </div>
        </div>
        {status?.state === 'downloading' && (
          <div className={styles.progress} role="progressbar" aria-valuenow={Math.round(status.progress)}>
            <div
              className={styles.progressFill}
              style={{ transform: `scaleX(${Math.max(0.02, status.progress / 100)})` }}
            />
          </div>
        )}
        {status?.notes && status.state !== 'up-to-date' && (
          <div className={styles.hintBox} style={{ margin: '0 16px 16px' }}>
            <Icon name="info" size={14} />
            <span style={{ whiteSpace: 'pre-wrap' }}>{status.notes}</span>
          </div>
        )}
      </Card>
    </div>
  );
}
