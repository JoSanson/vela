import { hostOf } from '@vela/core';
import { useMemo } from 'react';
import { Icon } from '../components/Icon';
import { invoke } from '../lib/api';
import styles from './Pages.module.css';

interface CertDetail {
  error: string;
  issuer: string;
  subject: string;
  validFrom: number;
  validTo: number;
  fingerprint: string;
}

export function ErrorPage() {
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
      <div className={`${styles.card} ${kind === 'cert' ? styles.danger : ''}`}>
        <div className={styles.iconWrap}>
          <Icon name={kind === 'cert' ? 'shield' : kind === 'crash' ? 'warning' : 'globe'} size={28} />
        </div>
        {kind === 'cert' && (
          <>
            <h1 className={styles.h1}>Your connection is not private</h1>
            <p className={styles.muted}>
              The certificate for <strong>{host}</strong> could not be verified ({cert?.error ?? detail}).
              Attackers might be trying to steal your information.
            </p>
            {cert && (
              <dl className={styles.dl}>
                <dt>Issued to</dt>
                <dd>{cert.subject}</dd>
                <dt>Issued by</dt>
                <dd>{cert.issuer}</dd>
                <dt>Valid</dt>
                <dd>
                  {new Date(cert.validFrom).toLocaleDateString()} →{' '}
                  {new Date(cert.validTo).toLocaleDateString()}
                </dd>
              </dl>
            )}
            <div className={styles.actions}>
              <button className={styles.primary} onClick={() => history.back()}>
                Go back
              </button>
              <button className={styles.secondary} onClick={proceed} data-testid="cert-proceed">
                Proceed to {host} (unsafe)
              </button>
            </div>
          </>
        )}
        {kind === 'net' && (
          <>
            <h1 className={styles.h1}>Can’t reach {host}</h1>
            <p className={styles.muted}>{detail}</p>
            <div className={styles.actions}>
              <button className={styles.primary} onClick={retry} data-testid="retry">
                Try again
              </button>
            </div>
          </>
        )}
        {kind === 'crash' && (
          <>
            <h1 className={styles.h1}>This page crashed</h1>
            <p className={styles.muted}>
              {host} stopped responding ({detail}).
            </p>
            <div className={styles.actions}>
              <button className={styles.primary} onClick={retry}>
                Reload
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
