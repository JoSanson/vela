import { hostOf } from '@vela/core';
import type { Translator } from '@vela/shared';
import { useMemo, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { invoke } from '../lib/api';
import { useT } from '../lib/i18n';
import styles from './Pages.module.css';

interface CertDetail {
  error: string;
  issuer: string;
  subject: string;
  validFrom: number;
  validTo: number;
  fingerprint: string;
}

/** Splits a message left with a literal `{host}` placeholder so the host can be rendered in bold. */
function withHost(message: string, host: string): ReactNode {
  const [before = '', after = ''] = message.split('{host}');
  return (
    <>
      {before}
      <strong>{host}</strong>
      {after}
    </>
  );
}

export function ErrorPage() {
  const t = useT();
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const kind = params.get('kind') ?? 'net';
  const url = params.get('url') ?? '';
  const detail = params.get('detail') ?? '';
  const host = hostOf(url) || url;
  const cert = useMemo<CertDetail | null>(() => {
    if (kind !== 'cert') return null;
    try {
      return JSON.parse(detail) as CertDetail;
    } catch {
      return null;
    }
  }, [kind, detail]);

  const retry = (): void => {
    location.href = url;
  };
  const proceed = (): void => {
    if (!cert) return;
    void invoke('certificate/trust', { fingerprint: cert.fingerprint, tabId: '' }).then(() => {
      location.href = url;
    });
  };

  return (
    <div className={styles.center} data-testid={`error-${kind}`}>
      <div className={`${styles.card} ${kind === 'cert' || kind === 'unsafe' ? styles.danger : ''}`}>
        <div className={styles.iconWrap}>
          <Icon
            name={kind === 'cert' || kind === 'unsafe' ? 'shield' : kind === 'crash' ? 'warning' : 'globe'}
            size={28}
          />
        </div>
        {kind === 'unsafe' && (
          <>
            <h1 className={styles.h1}>
              {detail === 'phishing'
                ? t('pages.error.unsafe.phishingTitle')
                : t('pages.error.unsafe.malwareTitle')}
            </h1>
            <p className={styles.muted}>
              {withHost(
                detail === 'phishing' ? t('pages.error.unsafe.phishing') : t('pages.error.unsafe.malware'),
                host,
              )}
            </p>
            <div className={styles.actions}>
              <button className={styles.primary} onClick={() => history.back()} data-testid="unsafe-back">
                {t('pages.error.goBack')}
              </button>
              <button
                className={styles.secondary}
                onClick={() => {
                  void invoke('safebrowsing/allow', { host }).then(() => {
                    location.href = url;
                  });
                }}
                data-testid="unsafe-proceed"
              >
                {t('pages.error.unsafe.proceed')}
              </button>
            </div>
          </>
        )}
        {kind === 'cert' && (
          <>
            <h1 className={styles.h1}>{t('pages.error.cert.title')}</h1>
            <p className={styles.muted}>
              {withHost(t('pages.error.cert.body', { error: cert?.error ?? detail }), host)}
            </p>
            {cert && (
              <dl className={styles.dl}>
                <dt>{t('pages.error.cert.issuedTo')}</dt>
                <dd>{cert.subject}</dd>
                <dt>{t('pages.error.cert.issuedBy')}</dt>
                <dd>{cert.issuer}</dd>
                <dt>{t('pages.error.cert.valid')}</dt>
                <dd>
                  {new Date(cert.validFrom).toLocaleDateString(t.locale)} →{' '}
                  {new Date(cert.validTo).toLocaleDateString(t.locale)}
                </dd>
              </dl>
            )}
            <div className={styles.actions}>
              <button className={styles.primary} onClick={() => history.back()}>
                {t('pages.error.goBack')}
              </button>
              <button className={styles.secondary} onClick={proceed} data-testid="cert-proceed">
                {t('pages.error.cert.proceed', { host })}
              </button>
            </div>
          </>
        )}
        {kind === 'net' && (
          <>
            <h1 className={styles.h1}>{t('pages.error.net.title', { host })}</h1>
            <p className={styles.muted}>{friendlyNetError(detail, t)}</p>
            <p className={styles.code}>{detail}</p>
            <div className={styles.actions}>
              <button className={styles.primary} onClick={retry} data-testid="retry">
                {t('common.retry')}
              </button>
            </div>
          </>
        )}
        {kind === 'crash' && (
          <>
            <h1 className={styles.h1}>{t('pages.error.crash.title')}</h1>
            <p className={styles.muted}>{t('pages.error.crash.body', { host, detail })}</p>
            <div className={styles.actions}>
              <button className={styles.primary} onClick={retry}>
                {t('pages.error.crash.reload')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const NET_MESSAGES = [
  [/NAME_NOT_RESOLVED/, 'pages.error.net.nameNotResolved'],
  [/INTERNET_DISCONNECTED/, 'pages.error.net.offline'],
  [/CONNECTION_REFUSED/, 'pages.error.net.refused'],
  [/CONNECTION_TIMED_OUT|TIMED_OUT/, 'pages.error.net.timeout'],
  [/CONNECTION_RESET/, 'pages.error.net.reset'],
  [/SSL|CERT/, 'pages.error.net.ssl'],
] as const;

function friendlyNetError(detail: string, t: Translator): string {
  for (const [re, key] of NET_MESSAGES) if (re.test(detail)) return t(key);
  return t('pages.error.net.generic');
}
