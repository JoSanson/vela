import { prettyUrl } from '@vela/core';
import type { LittleState } from '@vela/shared';
import { useEffect, useRef, useState } from 'react';
import { Favicon } from '../components/Favicon';
import { Icon } from '../components/Icon';
import { invoke, isMac, vela } from '../lib/api';
import { connectStore, useShell } from '../lib/store';
import { applyTheme, systemPrefersDark } from '../lib/theme';
import styles from './LittleApp.module.css';

export function LittleApp() {
  const core = useShell((s) => s.core);
  const [little, setLittle] = useState<LittleState | null>(null);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [sendOpen, setSendOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => connectStore(), []);
  useEffect(() => {
    void invoke('little/state', undefined).then((s) => s && setLittle(s));
    return vela.on('little/changed', setLittle);
  }, []);
  const theme = core.spaces[core.activeSpaceId]?.theme;
  useEffect(() => {
    if (theme) applyTheme(theme, systemPrefersDark(), useShell.getState().prefs.theme);
  }, [theme]);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const act = (action: 'back' | 'forward' | 'reload' | 'stop' | 'close'): void =>
    void invoke('little/action', { action });
  const navigate = (): void => {
    if (input.trim()) void invoke('little/action', { action: 'navigate', input });
    setEditing(false);
  };
  const send = (spaceId: string | null): void => void invoke('little/sendToMain', { spaceId });

  return (
    <div className={`${styles.bar} drag`} data-inset={isMac ? 'mac' : 'none'} data-testid="little-bar">
      <div className={`${styles.nav} no-drag`}>
        <button
          className={styles.btn}
          onClick={() => act('back')}
          disabled={!little?.canGoBack}
          aria-label="Back"
        >
          <Icon name="back" size={15} />
        </button>
        <button
          className={styles.btn}
          onClick={() => act('forward')}
          disabled={!little?.canGoForward}
          aria-label="Forward"
        >
          <Icon name="forward" size={15} />
        </button>
        <button
          className={styles.btn}
          onClick={() => act(little?.loading ? 'stop' : 'reload')}
          aria-label={little?.loading ? 'Stop' : 'Reload'}
        >
          <Icon name={little?.loading ? 'close' : 'reload'} size={14} />
        </button>
      </div>
      {editing ? (
        <input
          ref={inputRef}
          className={`${styles.input} no-drag`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter') navigate();
            if (e.key === 'Escape') setEditing(false);
          }}
          data-testid="little-input"
        />
      ) : (
        <button
          className={`${styles.url} no-drag`}
          onClick={() => {
            setInput(little?.url ?? '');
            setEditing(true);
          }}
          data-testid="little-url"
        >
          {little && (
            <Favicon
              tab={{
                favicon: little.favicon,
                emoji: null,
                url: little.url,
                sleeping: false,
                loading: little.loading,
              }}
              size={14}
            />
          )}
          <span className={styles.urlText}>{little ? prettyUrl(little.url) : ''}</span>
        </button>
      )}
      <div className={`${styles.send} no-drag`}>
        <button className={styles.sendBtn} onClick={() => send(null)} data-testid="little-send">
          <Icon name="send" size={13} />
          <span>Send to {core.spaces[core.activeSpaceId]?.name ?? 'Vela'}</span>
        </button>
        <button
          className={styles.sendMore}
          onClick={() => setSendOpen((v) => !v)}
          aria-label="Choose space"
          aria-expanded={sendOpen}
        >
          <Icon name="chevron" size={12} style={{ transform: 'rotate(90deg)' }} />
        </button>
        {sendOpen && (
          <div className={styles.menu} role="menu">
            {core.spaceOrder.map((id) => {
              const sp = core.spaces[id];
              if (!sp) return null;
              return (
                <button
                  key={id}
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => send(id)}
                  data-space-id={id}
                >
                  <span>{sp.emoji}</span>
                  <span>{sp.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
