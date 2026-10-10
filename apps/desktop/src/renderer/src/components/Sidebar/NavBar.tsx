import { prettyUrl } from '@vela/core';
import { invoke, isMac, modKey } from '../../lib/api';
import { selectActiveTab, useShell } from '../../lib/store';
import { Icon } from '../Icon';
import styles from './NavBar.module.css';

export function NavBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const tab = useShell(selectActiveTab);
  const siteControlOpen = useShell((s) => s.siteControlOpen);
  const setSiteControlOpen = useShell((s) => s.setSiteControlOpen);
  const fullscreen = useShell((s) => s.fullscreen);
  const id = tab?.id;
  return (
    <div className={`${styles.bar} drag`} data-inset={isMac && !fullscreen ? 'mac' : 'none'}>
      <div className={`${styles.group} no-drag`}>
        <button
          className={styles.btn}
          onClick={onToggleSidebar}
          aria-label="Hide sidebar"
          title={`Hide sidebar (${modKey}S)`}
        >
          <Icon name="sidebar" />
        </button>
        <button
          className={styles.btn}
          disabled={!tab?.canGoBack}
          onClick={() => id && void invoke('tab/back', { tabId: id })}
          aria-label="Back"
          title={`Back (${modKey}[)`}
        >
          <Icon name="back" />
        </button>
        <button
          className={styles.btn}
          disabled={!tab?.canGoForward}
          onClick={() => id && void invoke('tab/forward', { tabId: id })}
          aria-label="Forward"
          title={`Forward (${modKey}])`}
        >
          <Icon name="forward" />
        </button>
        <button
          className={styles.btn}
          disabled={!tab}
          onClick={() => id && void invoke(tab?.loading ? 'tab/stop' : 'tab/reload', { tabId: id })}
          aria-label={tab?.loading ? 'Stop' : 'Reload'}
          title={tab?.loading ? 'Stop' : `Reload (${modKey}R)`}
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
        aria-label="Address and search"
        title={`Search or enter URL (${modKey}L)`}
        data-testid="url-pill"
      >
        <span className={styles.urlText}>{tab ? prettyUrl(tab.url) : 'Search or enter URL'}</span>
      </button>
      {tab && (
        <button
          className={`${styles.site} no-drag`}
          onClick={() => setSiteControlOpen(!siteControlOpen)}
          aria-label="Site controls"
          aria-expanded={siteControlOpen}
          title="Site controls"
          data-testid="site-control-button"
        >
          <Icon
            name="shield"
            size={13}
            className={tab.url.startsWith('https://') ? styles.lockOk : styles.lock}
          />
        </button>
      )}
    </div>
  );
}
