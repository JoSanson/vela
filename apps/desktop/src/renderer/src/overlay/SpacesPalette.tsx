import { spaceTabs, type Id } from '@vela/core';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../components/Icon';
import { dispatch, invoke, modKey } from '../lib/api';
import { useHoverSelect } from '../lib/hoverSelect';
import { useT } from '../lib/i18n';
import { useShell } from '../lib/store';
import styles from './SpacesPalette.module.css';

const COLS = 4;

const activateSpace = (id: Id): void => dispatch({ type: 'space/activate', id, now: Date.now() });

/** Every Space at a glance: searchable cards (colour, emoji, name, profile, tab count), keyboard first. */
export function SpacesPalette() {
  const t = useT();
  const core = useShell((s) => s.core);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(() => Math.max(0, core.spaceOrder.indexOf(core.activeSpaceId)));
  const gridRef = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();

  const rows = core.spaceOrder.flatMap((id, i) => {
    const sp = core.spaces[id];
    if (!sp) return [];
    const profile = sp.profileId ? core.profiles[sp.profileId] : undefined;
    const profileName = profile?.ephemeral
      ? t('overlay.spaceEditor.privateProfile')
      : (profile?.name ?? t('overlay.spaces.profileDefault'));
    return [{ sp, n: i + 1, profileName, isPrivate: !!profile?.ephemeral, tabs: spaceTabs(core, id).length }];
  });
  const list = q
    ? rows.filter((r) => r.sp.name.toLowerCase().includes(q) || r.profileName.toLowerCase().includes(q))
    : rows;
  // A new query starts the selection over (derived during render, like the switcher).
  const [seenQ, setSeenQ] = useState(q);
  if (seenQ !== q) {
    setSeenQ(q);
    setIndex(0);
  }
  const sel = Math.min(index, Math.max(0, list.length - 1));

  const close = (): void => void invoke('overlay/hide', undefined);
  const go = (id: Id): void => {
    if (id !== core.activeSpaceId) activateSpace(id);
    close();
  };
  const create = (): void =>
    void invoke('overlay/show', { kind: 'spaceEditor', payload: { spaceId: 'new' } });

  // The grid always opens at the top (no jump towards the current Space, which is still selected
  // and ticked); only keyboard moves bring the selection into view, and without animation.
  const navigated = useRef(false);
  useLayoutEffect(() => {
    if (!navigated.current) return;
    const el = gridRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [sel, list.length]);

  const onKey = (e: React.KeyboardEvent): void => {
    const n = list.length;
    const step = (d: number): void => {
      if (n === 0) return;
      e.preventDefault();
      navigated.current = true;
      setIndex((sel + d + n * 8) % n);
    };
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowDown') step(sel + COLS < n ? COLS : n - 1 - sel);
    else if (e.key === 'ArrowUp') step(sel - COLS >= 0 ? -COLS : -sel);
    else if (e.key === 'Enter') {
      e.preventDefault();
      const r = list[sel];
      if (r) go(r.sp.id);
      else if (q) create();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  const hover = useHoverSelect(setIndex);

  return (
    <div className={styles.wrap} role="dialog" aria-label={t('overlay.spaces.title')} data-testid="spaces">
      <div className={styles.box} onKeyDown={onKey}>
        <div className={styles.inputRow}>
          <Icon name="search" size={18} className={styles.icon} />
          <input
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('overlay.spaces.search')}
            autoFocus
            spellCheck={false}
            aria-label={t('overlay.spaces.search')}
            data-testid="spaces-search"
          />
          <span className={styles.badge}>{t('settings.spaces.spacesCount', { n: rows.length })}</span>
        </div>
        <div
          className={styles.grid}
          role="listbox"
          aria-label={t('overlay.spaces.title')}
          ref={gridRef}
          style={{ '--cols': COLS } as CSSProperties}
        >
          {list.map((r, i) => {
            const isActive = r.sp.id === core.activeSpaceId;
            return (
              <button
                key={r.sp.id}
                role="option"
                aria-selected={i === sel}
                className={`${styles.card} ${i === sel ? styles.selected : ''}`}
                style={{ '--from': r.sp.theme.from, '--to': r.sp.theme.to } as CSSProperties}
                onMouseMove={(e) => hover(i, e)}
                onClick={() => go(r.sp.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  void invoke('menu/show', { kind: 'space', id: r.sp.id });
                }}
                data-testid="spaces-card"
                data-selected={i === sel ? 'true' : 'false'}
                data-space-id={r.sp.id}
              >
                <span className={styles.tile}>
                  <span className={styles.emoji} aria-hidden="true">
                    {r.sp.emoji}
                  </span>
                  {isActive && (
                    <span className={styles.current} aria-label={t('overlay.spaces.current')}>
                      <Icon name="check" size={11} />
                    </span>
                  )}
                  {r.n <= 9 && <kbd className={styles.key}>⌃{r.n}</kbd>}
                </span>
                <span className={styles.name}>{r.sp.name}</span>
                <span className={styles.meta}>
                  <span className={`${styles.profile} ${r.isPrivate ? styles.private : ''}`}>
                    {r.isPrivate && <Icon name="eye" size={10} />}
                    {r.profileName}
                  </span>
                  <span className={styles.count}>{t('common.tabs.count', { n: r.tabs })}</span>
                </span>
              </button>
            );
          })}
          {list.length === 0 && <p className={styles.empty}>{t('overlay.spaces.noMatch', { query })}</p>}
        </div>
        <div className={styles.footer}>
          <button className={styles.new} onClick={create} data-testid="spaces-new">
            <Icon name="plus" size={13} />
            {q && list.length === 0
              ? t('overlay.spaces.createNamed', { name: query.trim() })
              : t('shortcut.newSpace')}
          </button>
          <span className={styles.hint}>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            <kbd>↵</kbd> · <kbd>{modKey}⇧S</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
