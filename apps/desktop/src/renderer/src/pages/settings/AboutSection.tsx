import type { Translator, UpdateStatus } from '@vela/shared';
import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useT } from '../../lib/i18n';
import { tryInvoke, useEvent, useSnapshot } from '../lib';
import { useToast } from '../Toast';
import { Badge, Button, Card } from '../ui';
import styles from './Settings.module.css';

function versionOf(token: string): string | null {
  const m = new RegExp(`${token}/(\\S+)`).exec(navigator.userAgent);
  return m?.[1] ?? null;
}

function describe(
  t: Translator,
  s: UpdateStatus | null,
  auto: boolean,
): { title: string; sub: string; tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' } {
  if (!s)
    return {
      title: t('settings.about.status.unavailable.title'),
      sub: t('settings.about.status.unavailable.sub'),
      tone: 'neutral',
    };
  switch (s.state) {
    case 'checking':
      return {
        title: t('settings.about.status.checking.title'),
        sub: t('settings.about.status.checking.sub'),
        tone: 'accent',
      };
    case 'available':
      return {
        title: t('settings.about.status.available.title', { version: s.version ?? '' }),
        sub: auto ? t('settings.about.status.available.auto') : t('settings.about.status.available.manual'),
        tone: 'accent',
      };
    case 'downloading':
      return {
        title: s.version
          ? t('settings.about.status.downloading.title', { version: s.version })
          : t('settings.about.status.downloading.titleNoVersion'),
        sub: t('settings.about.status.downloading.sub', {
          percent: new Intl.NumberFormat(t.locale).format(Math.round(s.progress)),
        }),
        tone: 'accent',
      };
    case 'downloaded':
      return {
        title: t('settings.about.status.downloaded.title', { version: s.version ?? '' }),
        sub: t('settings.about.status.downloaded.sub'),
        tone: 'success',
      };
    case 'error':
      return {
        title: t('settings.about.status.error.title'),
        sub: s.error ?? t('settings.about.status.error.sub'),
        tone: 'danger',
      };
    case 'up-to-date':
      return {
        title: t('settings.about.status.upToDate.title'),
        sub: t('settings.about.status.upToDate.sub'),
        tone: 'success',
      };
    default:
      return {
        title: t('settings.about.status.idle.title'),
        sub: t('settings.about.status.idle.sub'),
        tone: 'neutral',
      };
  }
}

function badgeLabel(t: Translator, state: UpdateStatus['state'] | undefined): string {
  switch (state) {
    case 'up-to-date':
      return t('settings.about.badge.latest');
    case 'checking':
    case 'available':
    case 'downloading':
    case 'downloaded':
    case 'error':
      return t(`settings.about.badge.${state}`);
    default:
      return state ?? '';
  }
}

export function AboutSection() {
  const { snap } = useSnapshot();
  const { toast } = useToast();
  const t = useT();
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
    if (res === null) return toast(t('settings.about.checkError'), 'error');
    setStatus(res);
  };

  const install = async (): Promise<void> => {
    const ok = await tryInvoke('update/install', undefined);
    if (ok === null) toast(t('settings.about.installError'), 'error');
  };

  const info = describe(t, unavailable ? null : status, snap?.prefs.autoUpdate ?? true);
  const unknown = t('settings.about.unknown');
  const version = snap?.version ?? versionOf('Vela') ?? unknown;
  const electronVersion = versionOf('Electron');
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
            <div className={styles.brandSub}>{t('settings.about.tagline')}</div>
          </div>
        </div>
        <dl className={styles.aboutGrid} style={{ borderTop: '1px solid var(--p-border)' }}>
          <dt>Vela</dt>
          <dd data-testid="about-version">{version}</dd>
          <dt>Chromium</dt>
          <dd>{versionOf('Chrome') ?? unknown}</dd>
          {electronVersion !== null && (
            <>
              <dt>Electron</dt>
              <dd>{electronVersion}</dd>
            </>
          )}
          <dt>{t('settings.about.platform')}</dt>
          <dd>{platformLabel}</dd>
        </dl>
      </Card>

      <p className={styles.h3}>{t('settings.about.updates')}</p>
      <Card testId="about-updates">
        <div className={styles.updateRow}>
          <div className={styles.updateText}>
            <span>
              {info.title}{' '}
              {info.tone !== 'neutral' && <Badge tone={info.tone}>{badgeLabel(t, status?.state)}</Badge>}
            </span>
            <span className={styles.updateSub}>{info.sub}</span>
          </div>
          <div className={styles.headActions}>
            {status?.state === 'downloaded' ? (
              <Button variant="primary" icon="reload" testId="update-install" onClick={() => void install()}>
                {t('settings.about.restart')}
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
                {checking ? t('settings.about.checking') : t('settings.about.check')}
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
