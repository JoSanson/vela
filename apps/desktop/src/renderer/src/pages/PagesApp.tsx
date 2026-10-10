import type { CoreAction } from '@vela/core';
import type { Prefs, ShellSnapshot } from '@vela/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { setFaviconToken } from '../components/Favicon';
import { ArchivePage } from './ArchivePage';
import { DownloadsPage } from './DownloadsPage';
import { ErrorPage } from './ErrorPage';
import { HistoryPage } from './HistoryPage';
import { OnboardingPage } from './OnboardingPage';
import { ReaderPage } from './ReaderPage';
import styles from './Pages.module.css';
import { SettingsPage } from './settings/SettingsPage';
import { ShortcutsPage } from './ShortcutsPage';
import { SnapshotContext, tryInvoke, useEvent, useSystemDark, type SnapshotContextValue } from './lib';
import { ToastProvider } from './Toast';
import { EmptyState } from './ui';

export type InternalPage =
  'error' | 'history' | 'archive' | 'downloads' | 'settings' | 'shortcuts' | 'onboarding' | 'reader' | 'home';

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
    'reader',
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
    if (page === 'home') document.title = 'Vela';
    if (page === 'error') document.title = 'Error — Vela';
  }, [page]);

  const [snap, setSnap] = useState<ShellSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const refresh = useCallback(async (): Promise<void> => {
    const s = await tryInvoke('snapshot/get', undefined);
    if (s) {
      setFaviconToken(s.faviconToken);
      setSnap(s);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    void tryInvoke('snapshot/get', undefined).then((s) => {
      if (cancelled) return;
      if (s) {
        setFaviconToken(s.faviconToken);
        setSnap(s);
      } else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEvent('state/changed', (state) => setSnap((s) => (s ? { ...s, state } : s)));
  useEvent('prefs/changed', (prefs) => setSnap((s) => (s ? { ...s, prefs } : s)));

  const dispatch = useCallback(
    async (action: CoreAction): Promise<boolean> => {
      const r = await tryInvoke('state/dispatch', action);
      if (r === null) return false;
      await refresh();
      return true;
    },
    [refresh],
  );
  const setPrefs = useCallback(async (patch: Partial<Prefs>): Promise<boolean> => {
    const prefs = await tryInvoke('prefs/set', patch);
    if (!prefs) return false;
    setSnap((s) => (s ? { ...s, prefs } : s));
    return true;
  }, []);
  const ctx = useMemo<SnapshotContextValue>(
    () => ({ snap, failed, refresh, dispatch, setPrefs }),
    [snap, failed, refresh, dispatch, setPrefs],
  );

  const systemDark = useSystemDark();
  const theme = snap?.prefs.theme ?? 'system';
  const space = snap ? snap.state.spaces[snap.state.activeSpaceId] : undefined;
  const from = space?.theme.from;
  const to = space?.theme.to;
  useEffect(() => {
    const root = document.documentElement;
    root.style.colorScheme = theme === 'system' ? 'light dark' : theme;
    root.dataset.mode = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
    if (from) root.style.setProperty('--space-from', from);
    if (to) root.style.setProperty('--space-to', to);
  }, [theme, systemDark, from, to]);

  return (
    <SnapshotContext.Provider value={ctx}>
      <ToastProvider>
        <div className={styles.page} data-page={page}>
          {page === 'error' && <ErrorPage />}
          {page === 'reader' && <ReaderPage />}
          {page === 'history' && <HistoryPage />}
          {page === 'archive' && <ArchivePage />}
          {page === 'downloads' && <DownloadsPage />}
          {page === 'settings' && <SettingsPage />}
          {page === 'shortcuts' && <ShortcutsPage />}
          {page === 'onboarding' && <OnboardingPage />}
          {page === 'home' && (
            <div className={styles.center}>
              <EmptyState icon="command" title="Vela" hint="Press ⌘T to open a page." />
            </div>
          )}
        </div>
      </ToastProvider>
    </SnapshotContext.Provider>
  );
}
