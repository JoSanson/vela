import {
  displayTitle,
  hostOf,
  makeSearchItem,
  prettyUrl,
  rankItems,
  resolveInput,
  SEARCH_ENGINES,
  type ArchivedTab,
  type Id,
  type SearchItem,
} from '@vela/core';
import {
  matchSiteSearch,
  SHORTCUTS,
  siteHomeUrl,
  siteQueryOf,
  siteSearchBase,
  siteSearchUrl,
  type HistoryEntry,
  type MessageKey,
  type SiteSearch,
} from '@vela/shared';
import { isMac } from '../lib/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useHoverSelect } from '../lib/hoverSelect';
import { useT } from '../lib/i18n';
import { Favicon } from '../components/Favicon';
import { Icon, type IconName } from '../components/Icon';
import { dispatch, invoke } from '../lib/api';
import { useShell } from '../lib/store';
import styles from './CommandBar.module.css';

const KEY_GLYPH: Record<string, string> = isMac
  ? {
      CmdOrCtrl: '⌘',
      Cmd: '⌘',
      Ctrl: '⌃',
      Alt: '⌥',
      Shift: '⇧',
      Left: '←',
      Right: '→',
      Up: '↑',
      Down: '↓',
      Tab: '⇥',
    }
  : {
      CmdOrCtrl: 'Ctrl',
      Cmd: 'Win',
      Ctrl: 'Ctrl',
      Alt: 'Alt',
      Shift: 'Shift',
      Left: '←',
      Right: '→',
      Up: '↑',
      Down: '↓',
      Tab: 'Tab',
    };

function acceleratorLabel(acc: string): string {
  return acc
    .split('+')
    .map((p) => KEY_GLYPH[p] ?? p)
    .join(isMac ? '' : '+');
}

export interface CommandBarPayload {
  mode: 'new' | 'edit' | 'split';
  tabId?: Id | null;
}

const COMMANDS: { id: string; label: MessageKey; icon: IconName }[] = [
  { id: 'newSpace', label: 'overlay.command.newSpace', icon: 'plus' },
  { id: 'splitView', label: 'overlay.command.splitView', icon: 'split' },
  { id: 'toggleSidebar', label: 'overlay.command.toggleSidebar', icon: 'sidebar' },
  { id: 'pinTab', label: 'overlay.command.pinTab', icon: 'pin' },
  { id: 'archiveView', label: 'overlay.command.archiveView', icon: 'archive' },
  { id: 'history', label: 'overlay.command.history', icon: 'history' },
  { id: 'downloads', label: 'overlay.command.downloads', icon: 'download' },
  { id: 'settings', label: 'overlay.command.settings', icon: 'settings' },
  { id: 'shortcuts', label: 'overlay.command.shortcuts', icon: 'command' },
  { id: 'readerMode', label: 'overlay.command.readerMode', icon: 'book' },
  { id: 'devtools', label: 'overlay.command.devtools', icon: 'zap' },
  { id: 'littleWindow', label: 'overlay.command.littleWindow', icon: 'window' },
];

export function CommandBar({ payload }: { payload: CommandBarPayload }) {
  const t = useT();
  const core = useShell((s) => s.core);
  const prefs = useShell((s) => s.prefs);
  const mode = payload?.mode ?? 'new';
  const editTab = mode === 'edit' && payload.tabId ? core.tabs[payload.tabId] : undefined;
  const [query, setQuery] = useState(editTab ? editTab.url : '');

  const [suggestions, setSuggestions] = useState<{ query: string; list: string[] }>({ query: '', list: [] });
  const [sel, setSel] = useState<{ query: string; idx: number }>({ query: '', idx: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const engine = SEARCH_ENGINES.find((e) => e.id === prefs.searchEngineId) ?? SEARCH_ENGINES[0];
  // Site mode (`y` then Tab): the pill names the site, Enter searches it, Backspace on empty leaves.
  const [site, setSite] = useState<SiteSearch | null>(null);
  const sites = prefs.siteSearches;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (editTab) el.select();
  }, [editTab]);

  // Archive and history live in main (D016): queried per keystroke, never bulk-loaded into the overlay.
  const [remote, setRemote] = useState<{ query: string; items: SearchItem[] }>({ query: '', items: [] });
  const [recent, setRecent] = useState<{ siteId: string; query: string; items: string[] }>({
    siteId: '',
    query: '',
    items: [],
  });
  useEffect(() => {
    if (!site) return;
    const q = query.trim().toLowerCase();
    let cancelled = false;
    void invoke('history/search', { query: hostOf(siteSearchBase(site)), limit: 40 })
      .catch(() => [] as HistoryEntry[])
      .then((history) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const items: string[] = [];
        for (const h of history) {
          const text = siteQueryOf(site, h.url);
          if (!text || seen.has(text.toLowerCase())) continue;
          if (q && !text.toLowerCase().includes(q)) continue;
          seen.add(text.toLowerCase());
          items.push(text);
        }
        setRecent({ siteId: site.id, query: q, items: items.slice(0, 6) });
      });
    return () => {
      cancelled = true;
    };
  }, [site, query]);
  useEffect(() => {
    const q = query.trim();
    if (site || q.length < 2 || /^[a-z]+:\/\//i.test(q)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void Promise.all([
        invoke('archive/search', { query: q, limit: 12 }).catch(() => [] as ArchivedTab[]),
        invoke('history/search', { query: q, limit: 8 }).catch(() => [] as HistoryEntry[]),
      ]).then(([archived, history]) => {
        if (cancelled) return;
        const items: SearchItem[] = [
          ...archived.map((a) =>
            makeSearchItem({
              id: `archived:${a.id}`,
              kind: 'archived',
              title: a.title,
              subtitle: prettyUrl(a.url),
              boost: 0,
            }),
          ),
          ...history.map((h) =>
            makeSearchItem({
              id: `history:${h.url}`,
              kind: 'history',
              title: h.title || prettyUrl(h.url),
              subtitle: prettyUrl(h.url),
              boost: Math.min(0.3, h.visitCount / 50),
            }),
          ),
        ];
        setRemote({ query: q, items });
      });
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, site]);
  const trimmed = query.trim();
  // Inline completion: typing a host prefix fills the rest, selected, so Enter opens it and typing on replaces it.
  const [inline, setInline] = useState<{ typed: string; full: string; url: string } | null>(null);
  const lastTyped = useRef('');
  useEffect(() => {
    const q = query.trim();
    const forward = q.length > lastTyped.current.length && q.startsWith(lastTyped.current);
    lastTyped.current = q;
    if (site || !forward || q.length < 2 || /[\s/]/.test(q) || /^[a-z]+:/i.test(q)) {
      setInline(null);
      return;
    }
    const lower = q.toLowerCase();
    const candidates: { host: string; url: string; weight: number }[] = [];
    for (const t of Object.values(core.tabs)) {
      const host = hostOf(t.url);
      if (host.startsWith(lower)) candidates.push({ host, url: t.url, weight: 2 + t.lastActiveAt / 1e13 });
    }
    for (const it of remote.query === q ? remote.items : []) {
      if (it.kind !== 'history') continue;
      const url = it.id.slice('history:'.length);
      const host = hostOf(url);
      if (host.startsWith(lower)) candidates.push({ host, url: `https://${host}/`, weight: 1 + it.boost });
    }
    candidates.sort((a, b) => b.weight - a.weight);
    const best = candidates[0];
    setInline(
      best?.host !== undefined && best.host !== lower ? { typed: q, full: best.host, url: best.url } : null,
    );
  }, [query, core.tabs, remote, site]);
  useEffect(() => {
    const el = inputRef.current;
    if (!el || inline?.typed !== query.trim()) return;
    el.value = inline.full;
    el.setSelectionRange(inline.typed.length, inline.full.length);
  }, [inline, query]);

  const remoteItems = useMemo(() => (remote.query === trimmed ? remote.items : []), [remote, trimmed]);
  const index = useMemo<SearchItem[]>(() => {
    const items: SearchItem[] = [];
    const profileId = core.spaces[core.activeSpaceId]?.profileId ?? null;
    const tabs = Object.values(core.tabs).filter(
      (t) => t.kind !== 'favorite' || (t.profileId ?? null) === profileId,
    );
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
    items.push(...remoteItems);
    for (const c of COMMANDS) {
      const def = SHORTCUTS.find((s) => s.id === c.id);
      items.push(
        makeSearchItem({
          id: `cmd:${c.id}`,
          kind: 'command',
          title: t(c.label),
          subtitle: def ? acceleratorLabel(def.accelerator) : t('overlay.commandBar.commandSubtitle'),
          boost: 0,
        }),
      );
    }
    return items;
  }, [core.tabs, core.spaces, core.activeSpaceId, remoteItems, t]);

  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2 || /^[a-z]+:\/\//i.test(q)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void invoke('suggest/query', { query: q, ...(site ? { siteId: site.id } : {}) })
        .then((r) => {
          if (!cancelled && r.query === q) setSuggestions({ query: q, list: r.suggestions.slice(0, 4) });
        })
        .catch(() => undefined);
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, site]);

  const activeId = core.spaces[core.activeSpaceId]?.activeTabId ?? '';
  const keywordSite = useMemo(() => (site ? null : matchSiteSearch(query, sites)), [site, query, sites]);
  const results = useMemo(() => {
    const q = query.trim();
    if (site) {
      const list: SearchItem[] = [];
      if (q) {
        list.push(
          makeSearchItem({
            id: `sitesearch:${q}`,
            kind: 'search',
            title: q,
            subtitle: t('overlay.commandBar.searchSite', { name: site.name }),
            boost: 1,
          }),
        );
      } else {
        list.push(
          makeSearchItem({
            id: `siteopen:${siteHomeUrl(site)}`,
            kind: 'url',
            title: site.name,
            subtitle: t('overlay.commandBar.openSite', { name: site.name }),
            boost: 1,
          }),
        );
      }
      const lower = q.toLowerCase();
      const seen = new Set([lower]);
      for (const text of recent.siteId === site.id && recent.query === lower ? recent.items : []) {
        if (seen.has(text.toLowerCase())) continue;
        seen.add(text.toLowerCase());
        list.push(
          makeSearchItem({
            id: `sitesearch:${text}`,
            kind: 'history',
            title: text,
            subtitle: t('overlay.commandBar.recentOnSite', { name: site.name }),
            boost: 0,
          }),
        );
      }
      for (const text of suggestions.query === q ? suggestions.list : []) {
        if (seen.has(text.toLowerCase())) continue;
        seen.add(text.toLowerCase());
        list.push(
          makeSearchItem({
            id: `sitesearch:${text}`,
            kind: 'suggestion',
            title: text,
            subtitle: t('overlay.commandBar.searchSite', { name: site.name }),
            boost: 0,
          }),
        );
      }
      return list.slice(0, 10);
    }
    const ranked = rankItems(q, index, mode === 'split' ? 12 : 8).filter(
      (r) => mode !== 'split' || (!r.item.id.startsWith('cmd:') && r.item.id !== `tab:${activeId}`),
    );
    const list: SearchItem[] = ranked.map((r) => r.item);
    if (q && engine) {
      const { url, isSearch } = resolveInput(q, engine);
      const primary = makeSearchItem({
        id: isSearch ? `search:${q}` : `url:${url}`,
        kind: isSearch ? 'search' : 'url',
        title: isSearch ? q : prettyUrl(url),
        subtitle: isSearch
          ? t('overlay.commandBar.searchWith', { engine: engine.name })
          : hostOf(url)
            ? t('overlay.commandBar.openWebsite')
            : t('common.open'),
        boost: 1,
      });
      // A strong (prefix) match on an open tab or command beats the generic search row.
      const strong = ranked[0] && ranked[0].score >= 0.9 && ranked[0].item.kind !== 'archived';
      if (strong) list.splice(1, 0, primary);
      else list.unshift(primary);
      if (keywordSite) {
        list.unshift(
          makeSearchItem({
            id: `site:${keywordSite.id}`,
            kind: 'search',
            title: t('overlay.commandBar.searchSite', { name: keywordSite.name }),
            subtitle: acceleratorLabel('Tab'),
            boost: 1,
          }),
        );
      }
      for (const s of suggestions.query === q ? suggestions.list : []) {
        if (s.toLowerCase() === q.toLowerCase()) continue;
        list.push(
          makeSearchItem({
            id: `suggestion:${s}`,
            kind: 'suggestion',
            title: s,
            subtitle: t('overlay.commandBar.searchWith', { engine: engine.name }),
            boost: 0,
          }),
        );
      }
    }
    return list.slice(0, 10);
  }, [query, index, suggestions, engine, mode, activeId, t, site, recent, keywordSite]);

  const selected = sel.query === query ? Math.min(sel.idx, Math.max(0, results.length - 1)) : 0;
  const setSelected = (fn: number | ((s: number) => number)): void =>
    setSel({ query, idx: typeof fn === 'function' ? fn(selected) : fn });
  const hover = useHoverSelect((i) => {
    if (i !== selected) setSelected(i);
  });

  const enterSite = (s: SiteSearch): void => {
    setSite(s);
    setQuery('');
    setInline(null);
    setSuggestions({ query: '', list: [] });
    inputRef.current?.focus();
  };

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
      case 'site': {
        const s = sites.find((x) => x.id === value);
        if (s) enterSite(s);
        return;
      }
      case 'sitesearch':
        if (site) open(siteSearchUrl(site, value));
        return;
      case 'siteopen':
        open(value);
        return;
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
      case 'history':
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
    // Confirming an IME conversion (CJK) must never submit or move the selection.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const el = inputRef.current;
    if (e.key === 'Tab' && keywordSite) {
      e.preventDefault();
      enterSite(keywordSite);
      return;
    }
    if (site && e.key === 'Backspace' && !query) {
      e.preventDefault();
      setQuery(site.keyword);
      setSite(null);
      return;
    }
    const completed =
      !!inline && !!el && el.value === inline.full && el.selectionStart === inline.typed.length;
    if (completed && e.key === 'Enter') {
      e.preventDefault();
      run(
        makeSearchItem({ id: `url:${inline.url}`, kind: 'url', title: inline.full, subtitle: '', boost: 1 }),
      );
      return;
    }
    if (completed && (e.key === 'ArrowRight' || e.key === 'End' || e.key === 'Tab')) {
      e.preventDefault();
      setInline(null);
      setQuery(inline.full);
      return;
    }
    if (completed && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault();
      setInline(null);
      if (el) el.value = inline.typed;
      return;
    }
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

  const placeholder = site
    ? t('overlay.commandBar.placeholderSite', { name: site.name })
    : mode === 'split'
      ? t('overlay.commandBar.placeholderSplit')
      : t('overlay.commandBar.placeholder');
  const tint = site ? ({ '--space-from': site.color } as React.CSSProperties) : undefined;

  return (
    <div
      className={styles.wrap}
      role="dialog"
      aria-label={t('overlay.commandBar.ariaLabel')}
      data-testid="command-bar"
    >
      <div className={styles.box}>
        <div className={styles.inputRow}>
          <Icon name={mode === 'split' ? 'split' : 'search'} size={18} className={styles.icon} />
          {site && (
            <span
              className={styles.pill}
              style={{ background: site.color }}
              data-testid="command-site"
              onClick={() => inputRef.current?.focus()}
            >
              {site.name}
            </span>
          )}
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              // Typing over the selected completion keeps only what the user actually typed.
              setQuery(inline?.full === v ? inline.typed : v);
            }}
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
          {mode === 'split' && <span className={styles.badge}>{t('overlay.commandBar.badgeSplit')}</span>}
        </div>
        {results.length > 0 && (
          <ul className={styles.results} id="cmd-results" role="listbox" style={tint}>
            {results.map((item, i) => (
              <li
                key={item.id}
                id={`cmd-${i}`}
                role="option"
                aria-selected={i === selected}
                className={`${styles.item} ${i === selected ? styles.selected : ''}`}
                onMouseMove={(e) => hover(i, e)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(item)}
                data-testid="command-result"
              >
                <ResultIcon item={item} core={core} sites={sites} />
                <span className={styles.title}>{item.title}</span>
                <span className={styles.subtitle}>{item.subtitle}</span>
                {i === selected && <kbd className={styles.enter}>↵</kbd>}
              </li>
            ))}
          </ul>
        )}
        {!query && results.length === 0 && (
          <div className={styles.hint}>{t('overlay.commandBar.hint', { n: SHORTCUTS.length })}</div>
        )}
      </div>
    </div>
  );
}

function ResultIcon({
  item,
  core,
  sites,
}: {
  item: SearchItem;
  core: ReturnType<typeof useShell.getState>['core'];
  sites: readonly SiteSearch[];
}) {
  const [kind, value] = item.id.split(':', 2);
  if (kind === 'site') {
    const s = sites.find((x) => x.id === value);
    return <span className={styles.dot} style={{ background: s?.color }} aria-hidden="true" />;
  }
  if (kind === 'tab') {
    const tab = core.tabs[value ?? ''];
    if (tab) return <Favicon tab={tab} size={18} />;
  }
  if (kind === 'cmd') {
    const c = COMMANDS.find((x) => x.id === value);
    return <Icon name={c?.icon ?? 'command'} size={16} className={styles.kindIcon} />;
  }
  const icon: IconName =
    kind === 'archived'
      ? 'archive'
      : item.kind === 'history'
        ? 'history'
        : kind === 'url' || kind === 'siteopen'
          ? 'globe'
          : 'search';
  return <Icon name={icon} size={16} className={styles.kindIcon} />;
}
