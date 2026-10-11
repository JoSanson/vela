import { displayTitle, mruTabs, prettyUrl } from '@vela/core';
import { useEffect, useState } from 'react';
import { Favicon } from '../components/Favicon';
import { dispatch, invoke } from '../lib/api';
import { useHoverSelect } from '../lib/hoverSelect';
import { useT } from '../lib/i18n';
import { useShell } from '../lib/store';
import styles from './Switcher.module.css';

export interface SwitcherPayload {
  direction: 1 | -1;
  seq: number;
}

/** Ctrl+Tab switcher: steps through MRU tabs while Control is held, commits on release. */
export function Switcher({ payload }: { payload: SwitcherPayload }) {
  const t = useT();
  const core = useShell((s) => s.core);
  const tabs = mruTabs(core, 10);
  const [sel, setSel] = useState<{ seq: number; index: number }>(() => ({
    seq: payload.seq,
    index: payload.direction > 0 ? Math.min(1, tabs.length - 1) : Math.max(0, tabs.length - 1),
  }));
  const n = Math.max(1, tabs.length);
  // Each Ctrl+Tab press re-shows the overlay with a new seq: derive the step during render (no ref access).
  const index = sel.seq === payload.seq ? sel.index : (sel.index + payload.direction + n) % n;
  if (sel.seq !== payload.seq) setSel({ seq: payload.seq, index });
  const setIndex = (fn: number | ((i: number) => number)): void =>
    setSel({ seq: payload.seq, index: typeof fn === 'function' ? fn(index) : fn });
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const selected = tabs[index];

  useEffect(() => {
    if (!selected || previews[selected.id] || !selected.loaded) return;
    const id = selected.id;
    const t = setTimeout(() => {
      void invoke('tab/preview', { tabId: id, width: 320 }).then((r) => {
        if (r.dataUrl) setPreviews((p) => ({ ...p, [id]: r.dataUrl ?? '' }));
      });
    }, 60);
    return () => clearTimeout(t);
  }, [selected, previews]);

  useEffect(() => {
    const commit = (): void => {
      const target = tabs[index];
      if (target) dispatch({ type: 'tab/activate', id: target.id, now: Date.now() });
      void invoke('overlay/hide', undefined);
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Control' || e.key === 'Meta') commit();
    };
    const n = Math.max(1, tabs.length);
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowRight') setSel({ seq: payload.seq, index: (index + 1) % n });
      if (e.key === 'ArrowLeft') setSel({ seq: payload.seq, index: (index - 1 + n) % n });
      if (e.key === 'Enter') commit();
    };
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [tabs, index, payload.seq]);

  const hover = useHoverSelect(setIndex);
  if (tabs.length === 0) return null;

  return (
    <div
      className={styles.wrap}
      role="dialog"
      aria-label={t('overlay.switcher.ariaLabel')}
      data-testid="switcher"
    >
      <div className={styles.strip}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            className={`${styles.card} ${i === index ? styles.selected : ''}`}
            onMouseMove={(e) => hover(i, e)}
            onClick={() => {
              dispatch({ type: 'tab/activate', id: t.id, now: Date.now() });
              void invoke('overlay/hide', undefined);
            }}
            data-testid="switcher-item"
            data-selected={i === index ? 'true' : 'false'}
          >
            <div className={styles.preview}>
              {previews[t.id] ? <img src={previews[t.id]} alt="" /> : <Favicon tab={t} size={28} />}
            </div>
            <div className={styles.meta}>
              <Favicon tab={t} size={14} />
              <span className={styles.title}>{displayTitle(t)}</span>
            </div>
            <div className={styles.url}>{prettyUrl(t.url)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
