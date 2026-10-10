import { useEffect, useState } from 'react';
import { ErrorPage } from './ErrorPage';
import styles from './Pages.module.css';

export type InternalPage =
  'error' | 'history' | 'archive' | 'downloads' | 'settings' | 'shortcuts' | 'onboarding' | 'home';

function pageFromLocation(): InternalPage {
  const host = location.hostname || location.host;
  const known: InternalPage[] = [
    'error',
    'history',
    'archive',
    'downloads',
    'settings',
    'shortcuts',
    'onboarding',
  ];
  return known.find((k) => k === host) ?? 'home';
}

export function PagesApp() {
  const [page, setPage] = useState<InternalPage>(pageFromLocation);
  useEffect(() => {
    const onPop = (): void => setPage(pageFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    document.title = page === 'home' ? 'Vela' : `${page.charAt(0).toUpperCase()}${page.slice(1)} — Vela`;
  }, [page]);

  return (
    <div className={styles.page} data-page={page}>
      {page === 'error' && <ErrorPage />}
      {page !== 'error' && (
        <div className={styles.center}>
          <h1 className={styles.h1}>vela://{page}</h1>
          <p className={styles.muted}>Coming soon.</p>
        </div>
      )}
    </div>
  );
}
