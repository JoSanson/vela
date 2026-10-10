import {
  displayTitle,
  hostOf,
  makeSearchItem,
  prettyUrl,
  rankItems,
  resolveInput,
  SEARCH_ENGINES,
  type Id,
  type SearchItem,
} from '@vela/core';
import { SHORTCUTS } from '@vela/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Favicon } from '../components/Favicon';
import { Icon, type IconName } from '../components/Icon';
import { dispatch, invoke } from '../lib/api';
import { useShell } from '../lib/store';
import styles from './CommandBar.module.css';

export interface CommandBarPayload {
  mode: 'new' | 'edit' | 'split';
  tabId?: Id | null;
}

const COMMANDS: { id: string; label: string; icon: IconName }[] = [
  { id: 'newSpace', label: 'New space', icon: 'plus' },
  { id: 'splitView', label: 'Split view', icon: 'split' },
  { id: 'toggleSidebar', label: 'Toggle sidebar', icon: 'sidebar' },
  { id: 'pinTab', label: 'Pin / unpin tab', icon: 'pin' },
  { id: 'archiveView', label: 'Archived tabs', icon: 'archive' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'downloads', label: 'Downloads', icon: 'download' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'command' },
  { id: 'readerMode', label: 'Reader mode', icon: 'book' },
  { id: 'devtools', label: 'Developer tools', icon: 'zap' },
  { id: 'littleWindow', label: 'New Little Vela window', icon: 'window' },
];

export function CommandBar({ payload }: { payload: CommandBarPayload }) {
  const core = useShell((s) => s.core);
  const prefs = useShell((s) => s.prefs);
  const mode = payload?.mode ?? 'new';
  const editTab = mode === 'edit' && payload.tabId ? core.tabs[payload.tabId] : undefined;
  const [query, setQuery] = useState(editTab ? editTab.url : '');

  const [suggestions, setSuggestions] = useState<{ query: string; list: string[] }>({ query: '', list: [] });
  const [sel, setSel] = useState<{ query: string; idx: number }>({ query: '', idx: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const engine = SEARCH_ENGINES.find((e) => e.id === prefs.searchEngineId) ?? SEARCH_ENGINES[0];

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (editTab) el.select();
  }, [editTab]);

  const index = useMemo<SearchItem[]>(() => {
    const items: SearchItem[] = [];
    const tabs = Object.values(core.tabs);
    const newest = tabs.reduce((m, t) => Math.max(m, t.lastActiveAt), 0);
    for (const t of tabs) {
      const age = Math.max(0, newest - t.lastActiveAt);
      items.push(
        makeSearchItem({
          id: `tab:${t.id}`,
          kind: t.kind === 'favorite' ? 'favorite' : 'tab',
          title: displayTitle(t),
          subtitle: prettyUrl(t.url),
          boost: Math.max(0, 1 - age / (1000 * 60 * 60 * 24)),
        }),
      );
    }
    for (const a of core.archive.slice(0, 2000)) {
      items.push(
        makeSearchItem({
          id: `archived:${a.id}`,
          kind: 'archived',
          title: a.title,
          subtitle: prettyUrl(a.url),
          boost: 0,
        }),
      );
    }
    for (const c of COMMANDS) {
      items.push(
        makeSearchItem({ id: `cmd:${c.id}`, kind: 'command', title: c.label, subtitle: 'Command', boost: 0 }),
      );
    }
    return items;
  }, [core.tabs, core.archive]);

  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2 || /^[a-z]+:\/\//i.test(q)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void invoke('suggest/query', { query: q })
        .then((r) => {
          if (!cancelled && r.query === q) setSuggestions({ query: q, list: r.suggestions.slice(0, 4) });
        })
        .catch(() => undefined);
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const results = useMemo(() => {
    const q = query.trim();
    const ranked = rankItems(q, index, mode === 'split' ? 12 : 8).filter(
      (r) => mode !== 'split' || !r.item.id.startsWith('cmd:'),
    );
    const list: SearchItem[] = ranked.map((r) => r.item);
    if (q && engine) {
      const { url, isSearch } = resolveInput(q, engine);
      const primary = makeSearchItem({
        id: isSearch ? `search:${q}` : `url:${url}`,
        kind: isSearch ? 'search' : 'url',
        title: isSearch ? q : prettyUrl(url),
        subtitle: isSearch ? `Search ${engine.name}` : hostOf(url) ? 'Open website' : 'Open',
        boost: 1,
      });
      // A strong (prefix) match on an open tab or command beats the generic search row.
      const strong = ranked[0] && ranked[0].score >= 0.9 && ranked[0].item.kind !== 'archived';
      if (strong) list.splice(1, 0, primary);
      else list.unshift(primary);
      for (const s of suggestions.query === q ? suggestions.list : []) {
        if (s.toLowerCase() === q.toLowerCase()) continue;
        list.push(
          makeSearchItem({
            id: `suggestion:${s}`,
            kind: 'suggestion',
            title: s,
            subtitle: `Search ${engine.name}`,
            boost: 0,
          }),
        );
      }
    }
    return list.slice(0, 10);
  }, [query, index, suggestions, engine, mode]);

  const selected = sel.query === query ? Math.min(sel.idx, Math.max(0, results.length - 1)) : 0;
  const setSelected = (fn: number | ((s: number) => number)): void =>
    setSel({ query, idx: typeof fn === 'function' ? fn(selected) : fn });

  const run = (item: SearchItem | undefined): void => {
    if (!item) return;
    const [kind, ...rest] = item.id.split(':');
    const value = rest.join(':');
    const open = (input: string): void => {
      if (mode === 'edit' && payload.tabId) {
        void invoke('tab/navigate', { tabId: payload.tabId, input });
      } else if (mode === 'split') {
        void invoke('tab/openUrl', { input, activate: false, noAtc: true }).then((id) => {
          dispatch({ type: 'split/add', spaceId: core.activeSpaceId, tabId: id });
          dispatch({ type: 'tab/activate', id, now: Date.now() });
        });
      } else {
        void invoke('tab/openUrl', { input });
      }
      void invoke('overlay/hide', undefined);
    };
    switch (kind) {
      case 'tab':
        if (mode === 'split') dispatch({ type: 'split/add', spaceId: core.activeSpaceId, tabId: value });
        else dispatch({ type: 'tab/activate', id: value, now: Date.now() });
        void invoke('overlay/hide', undefined);
        return;
      case 'archived':
        dispatch({ type: 'archive/restore', id: value, newTabId: crypto.randomUUID(), now: Date.now() });
        void invoke('overlay/hide', undefined);
        return;
      case 'cmd':
        void invoke('overlay/hide', undefined);
        void invoke('command/run', { id: value });
        return;
      case 'search':
      case 'suggestion':
        open(value);
        return;
      case 'url':
        open(value);
        return;
      default:
        open(query);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(results.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[selected] ?? results[0]);
    } else if (e.key === 'Tab' && results[selected]?.kind === 'suggestion') {
      e.preventDefault();
      setQuery(results[selected]?.title ?? query);
    }
  };

  const placeholder = mode === 'split' ? 'Search or enter URL for the new pane…' : 'Search or enter URL…';

  return (
    <div className={styles.wrap} role="dialog" aria-label="Command bar" data-testid="command-bar">
      <div className={styles.box}>
        <div className={styles.inputRow}>
          <Icon name={mode === 'split' ? 'split' : 'search'} size={18} className={styles.icon} />
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            autoComplete="off"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="cmd-results"
            aria-activedescendant={results[selected] ? `cmd-${selected}` : undefined}
            aria-autocomplete="list"
            data-testid="command-input"
          />
          {mode === 'split' && <span className={styles.badge}>Split</span>}
        </div>
        {results.length > 0 && (
          <ul className={styles.results} id="cmd-results" role="listbox">
            {results.map((item, i) => (
              <li
                key={item.id}
                id={`cmd-${i}`}
                role="option"
                aria-selected={i === selected}
                className={`${styles.item} ${i === selected ? styles.selected : ''}`}
                onMouseEnter={() => setSelected(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(item)}
                data-testid="command-result"
              >
                <ResultIcon item={item} core={core} />
                <span className={styles.title}>{item.title}</span>
                <span className={styles.subtitle}>{item.subtitle}</span>
                {i === selected && <kbd className={styles.enter}>↵</kbd>}
              </li>
            ))}
          </ul>
        )}
        {!query && results.length === 0 && (
          <div className={styles.hint}>
            Type to search, paste a link, or run a command. {SHORTCUTS.length} shortcuts available.
          </div>
        )}
      </div>
    </div>
  );
}

function ResultIcon({
  item,
  core,
}: {
  item: SearchItem;
  core: ReturnType<typeof useShell.getState>['core'];
}) {
  const [kind, value] = item.id.split(':', 2);
  if (kind === 'tab') {
    const tab = core.tabs[value ?? ''];
    if (tab) return <Favicon tab={tab} size={18} />;
  }
  if (kind === 'cmd') {
    const c = COMMANDS.find((x) => x.id === value);
    return <Icon name={c?.icon ?? 'command'} size={16} className={styles.kindIcon} />;
  }
  const icon: IconName = kind === 'archived' ? 'archive' : kind === 'url' ? 'globe' : 'search';
  return <Icon name={icon} size={16} className={styles.kindIcon} />;
}
