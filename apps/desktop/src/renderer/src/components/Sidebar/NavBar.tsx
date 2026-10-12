import { prettyUrl } from '@vela/core';
import { invoke, isMac, modKey } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { selectActivePartition, selectActiveTab, useShell } from '../../lib/store';
import { Icon } from '../Icon';
import styles from './NavBar.module.css';

export function NavBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const tab = useShell(selectActiveTab);
  const siteControlOpen = useShell((s) => s.siteControlOpen);
  const setSiteControlOpen = useShell((s) => s.setSiteControlOpen);
  const fullscreen = useShell((s) => s.fullscreen);
  const partition = useShell(selectActivePartition);
  const t = useT();
  const id = tab?.id;
  return (
    <div className={`${styles.bar} drag`} data-inset={isMac && !fullscreen ? 'mac' : 'none'}>
      <div className={styles.group}>
        <button
          className={`${styles.btn} no-drag`}
          onClick={onToggleSidebar}
          aria-label={t('shell.navBar.hideSidebar')}
          title={t('shell.navBar.hideSidebarTitle', { shortcut: `${modKey}S` })}
        >
          <Icon name="sidebar" />
        </button>
        <span className={styles.spacer} />
        <browser-action-list
          className={`${styles.extensions} no-drag`}
          partition={partition}
          alignment="bottom right"
          data-testid="extension-actions"
        />
        <button
          className={`${styles.btn} no-drag`}
          disabled={!tab?.canGoBack}
          onClick={() => id && void invoke('tab/back', { tabId: id })}
          aria-label={t('shortcut.back')}
          title={t('shell.navBar.backTitle', { shortcut: `${modKey}[` })}
        >
          <Icon name="back" />
        </button>
        <button
          className={`${styles.btn} no-drag`}
          disabled={!tab?.canGoForward}
          onClick={() => id && void invoke('tab/forward', { tabId: id })}
          aria-label={t('shortcut.forward')}
          title={t('shell.navBar.forwardTitle', { shortcut: `${modKey}]` })}
        >
          <Icon name="forward" />
        </button>
        <button
          className={`${styles.btn} no-drag`}
          disabled={!tab}
          onClick={() => id && void invoke(tab?.loading ? 'tab/stop' : 'tab/reload', { tabId: id })}
          aria-label={tab?.loading ? t('shell.little.stop') : t('shortcut.reload')}
          title={
            tab?.loading ? t('shell.little.stop') : t('shell.navBar.reloadTitle', { shortcut: `${modKey}R` })
          }
        >
          <Icon name={tab?.loading ? 'close' : 'reload'} />
        </button>
      </div>
      <button
        className={`${styles.url} no-drag`}
        onClick={() =>
          void invoke('overlay/show', {
            kind: 'commandBar',
            payload: { mode: tab ? 'edit' : 'new', tabId: id },
          })
        }
        aria-label={t('shell.navBar.address')}
        title={t('shell.navBar.searchOrEnterUrlTitle', { shortcut: `${modKey}L` })}
        data-testid="url-pill"
        onContextMenu={(e) => {
          e.preventDefault();
          void invoke('menu/show', { kind: 'urlPill' });
        }}
      >
        <span className={styles.urlText}>
          {tab ? prettyUrl(tab.url) : t('shell.navBar.searchOrEnterUrl')}
        </span>
        {tab && Math.abs(tab.zoom - 1) > 0.001 && (
          <span className={styles.zoom} data-testid="zoom-badge">
            {new Intl.NumberFormat(t.locale, { style: 'percent' }).format(tab.zoom)}
          </span>
        )}
      </button>
      {tab && (
        <button
          className={`${styles.site} no-drag`}
          onClick={() => setSiteControlOpen(!siteControlOpen)}
          aria-label={t('shell.siteControl.title')}
          aria-expanded={siteControlOpen}
          title={t('shell.siteControl.title')}
          data-testid="site-control-button"
        >
          <Icon
            name="shield"
            size={13}
            className={
              tab.certWarning ? styles.lockBad : tab.url.startsWith('https://') ? styles.lockOk : styles.lock
            }
          />
        </button>
      )}
    </div>
  );
}
