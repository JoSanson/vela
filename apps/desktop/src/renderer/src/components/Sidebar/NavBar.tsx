import { prettyUrl } from '@vela/core';
import { invoke, isMac } from '../../lib/api';
import { selectActiveTab, useShell } from '../../lib/store';
import { Icon } from '../Icon';
import styles from './NavBar.module.css';

export function NavBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const tab = useShell(selectActiveTab);
  const fullscreen = useShell((s) => s.fullscreen);
  const id = tab?.id;
  return (
    <div className={`${styles.bar} drag`} data-inset={isMac && !fullscreen ? 'mac' : 'none'}>
      <div className={`${styles.group} no-drag`}>
        <button
          className={styles.btn}
          onClick={onToggleSidebar}
          aria-label="Hide sidebar"
          title="Hide sidebar (⌘S)"
        >
          <Icon name="sidebar" />
        </button>
        <button
          className={styles.btn}
          disabled={!tab?.canGoBack}
          onClick={() => id && void invoke('tab/back', { tabId: id })}
          aria-label="Back"
        >
          <Icon name="back" />
        </button>
        <button
          className={styles.btn}
          disabled={!tab?.canGoForward}
          onClick={() => id && void invoke('tab/forward', { tabId: id })}
          aria-label="Forward"
        >
          <Icon name="forward" />
        </button>
        <button
          className={styles.btn}
          disabled={!tab}
          onClick={() => id && void invoke(tab?.loading ? 'tab/stop' : 'tab/reload', { tabId: id })}
          aria-label={tab?.loading ? 'Stop' : 'Reload'}
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
        data-testid="url-pill"
      >
        {tab?.url.startsWith('https://') && <Icon name="shield" size={12} className={styles.lock} />}
        <span className={styles.urlText}>{tab ? prettyUrl(tab.url) : 'Search or enter URL'}</span>
      </button>
    </div>
  );
}
