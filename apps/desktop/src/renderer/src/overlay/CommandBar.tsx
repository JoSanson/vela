import {
  activeItemId,
  displayUrl,
  hostOf,
  rankHome,
  rankOmnibox,
  resolveInput,
  rootSpaceId,
  roundAnswer,
  SEARCH_ENGINES,
  searchUrl,
  tokenize,
  type Id,
  type OmniRow,
  type Range,
} from '@vela/core';
import {
  matchSiteSearch,
  siteHomeUrl,
  siteQueryOf,
  siteSearchBase,
  siteSearchUrl,
  type HistoryEntry,
  type OmniboxData,
  type SiteSearch,
} from '@vela/shared';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Favicon } from '../components/Favicon';
import { Icon, type IconName } from '../components/Icon';
import { dispatch, invoke, isMac } from '../lib/api';
import { useHoverSelect } from '../lib/hoverSelect';
import { useLocale, useT } from '../lib/i18n';
import { useShell } from '../lib/store';
import styles from './CommandBar.module.css';
import {
  archiveCandidates,
  COMMAND_ICONS,
  commandCandidates,
  historyCandidates,
  spaceCandidates,
  tabCandidates,
} from './omniboxSources';

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

type Open = 'default' | 'split' | 'background';

const EMPTY_DATA: OmniboxData = { query: '', history: [], inputs: [], archived: [], closed: [] };

/** The query without its `>` / `?` scope prefix: what adaptive history learns from. */
const learnable = (q: string): string => q.trim().replace(/^[>?]\s*/, '');

export function CommandBar({ payload }: { payload: CommandBarPayload }) {
  const t = useT();
  const locale = useLocale();
  const core = useShell((s) => s.core);
  const prefs = useShell((s) => s.prefs);
  const mode = payload?.mode ?? 'new';
  const editTab = mode === 'edit' && payload.tabId ? core.tabs[payload.tabId] : undefined;
  const [query, setQuery] = useState(editTab ? editTab.url : '');
  const inputRef = useRef<HTMLInputElement>(null);
  const engine = SEARCH_ENGINES.find((e) => e.id === prefs.searchEngineId) ?? SEARCH_ENGINES[0];
  // Site mode (`y` then Tab): the pill names the site, Enter searches it, Backspace on empty leaves.
  const [site, setSite] = useState<SiteSearch | null>(null);
  const sites = prefs.siteSearches;
  // Spaces are sealed (D030): only the current Space's tabs, archive and history (favorites: its profile's).
  const spaceId = core.activeSpaceId;
  const rootId = rootSpaceId(core, spaceId);
  const spaceProfileId = core.spaces[spaceId]?.profileId ?? null;
  const activeId = activeItemId(core) ?? '';
  // Frecency and adaptive decay are measured from when the bar opened: stable while typing.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (editTab) el.select();
  }, [editTab]);

  // One round trip per keystroke (D016: archive and history stay in main). The previous answer
  // stays on screen and is re-ranked locally until the new one lands: the list never blinks.
  const [data, setData] = useState<OmniboxData>(EMPTY_DATA);
  const [dataVersion, setDataVersion] = useState(0);
  useEffect(() => {
    if (site) return;
    const q = mode === 'edit' && query === editTab?.url ? '' : learnable(query);
    if (/^[a-z]+:\/\//i.test(q)) return;
    let cancelled = false;
    void invoke('omnibox/query', { query: q, spaceId })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [query, site, spaceId, mode, editTab, dataVersion]);

  const [suggestions, setSuggestions] = useState<{ query: string; list: string[] }>({ query: '', list: [] });
  useEffect(() => {
    const q = learnable(query);
    if (q.length < 2 || /^[a-z]+:\/\//i.test(q) || query.trimStart().startsWith('>')) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void invoke('suggest/query', { query: q, ...(site ? { siteId: site.id } : {}) })
        .then((r) => {
          if (!cancelled && r.query === q) setSuggestions({ query: q, list: r.suggestions.slice(0, 5) });
        })
        .catch(() => undefined);
    }, 70);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, site]);

  const [recent, setRecent] = useState<{ siteId: string; query: string; items: string[] }>({
    siteId: '',
    query: '',
    items: [],
  });
  useEffect(() => {
    if (!site) return;
    const q = query.trim().toLowerCase();
    let cancelled = false;
    void invoke('history/search', { query: hostOf(siteSearchBase(site)), limit: 40, spaceId })
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
  }, [site, query, spaceId]);

  const commands = useMemo(() => commandCandidates(t), [t]);
  const tabs = useMemo(
    () => tabCandidates(core, spaceId, spaceProfileId, activeId),
    [core, spaceId, spaceProfileId, activeId],
  );
  const activeTab = core.tabs[activeId];
  const spaces = useMemo(
    () => spaceCandidates(core, rootId, t, !!activeTab && activeTab.kind !== 'favorite'),
    [core, rootId, t, activeTab],
  );
  const remote = useMemo(
    () => [
      ...historyCandidates(data.history),
      ...archiveCandidates(data.archived, 'archived'),
      ...archiveCandidates(data.closed, 'closed'),
    ],
    [data],
  );
  const candidates = useMemo(() => {
    const all = [...tabs, ...remote];
    if (mode === 'split') return all.filter((c) => !c.current);
    return [...all, ...commands.candidates, ...spaces];
  }, [tabs, remote, commands, spaces, mode]);

  // Inline completion is offered only while the user types forward: deleting it must not bring it back.
  const [completes, setCompletes] = useState(false);
  const changeQuery = (v: string): void => {
    const before = query.trim();
    const after = v.trim();
    setCompletes(after.length > before.length && after.startsWith(before));
    setQuery(v);
  };

  const showingEditUrl = mode === 'edit' && !!editTab && query === editTab.url;
  const keywordSite = useMemo(() => (site ? null : matchSiteSearch(query, sites)), [site, query, sites]);

  const result = useMemo(() => {
    const q = query.trim();
    if (site) return { rows: siteRows(site, q, recent, suggestions), completion: null };
    if (!q || showingEditUrl) {
      const homeRows = rankHome(candidates, now, mode === 'split' ? { closed: 0 } : {});
      if (!showingEditUrl || !editTab) return { rows: homeRows, completion: null };
      // ⌘L then Enter reloads the page as it is, never jumps to a recent tab.
      const self: OmniRow = {
        id: `url:${editTab.url}`,
        kind: 'url',
        group: 'top',
        title: displayUrl(editTab.url),
        url: editTab.url,
        titleRanges: [],
        urlRanges: [],
        score: 1,
      };
      return { rows: [self, ...homeRows.filter((r) => r.url !== editTab.url)], completion: null };
    }
    const typed = engine && !/^[>?]/.test(q) ? resolveInput(q, engine) : null;
    const lower = tokenize(learnable(q)).join(' ');
    const suggestionList = (suggestions.list ?? []).filter((s) => tokenize(s).join(' ').startsWith(lower));
    const r = rankOmnibox({
      query: q,
      now,
      candidates,
      inputs: data.inputs,
      suggestions: suggestionList,
      typed,
      complete: completes,
      maxNav: mode === 'split' ? 8 : 6,
    });
    const rows = r.rows.filter((row) => mode !== 'split' || row.kind !== 'answer');
    if (keywordSite) {
      rows.unshift({
        id: `site:${keywordSite.id}`,
        kind: 'search',
        group: 'top',
        title: t('overlay.commandBar.searchSite', { name: keywordSite.name }),
        titleRanges: [],
        urlRanges: [],
        score: 3,
      });
    }
    return { rows: rows.slice(0, 11), completion: r.completion };
  }, [
    query,
    site,
    recent,
    suggestions,
    t,
    candidates,
    data.inputs,
    engine,
    mode,
    keywordSite,
    showingEditUrl,
    editTab,
    completes,
    now,
  ]);
  const rows = result.rows;
  const completion = result.completion;

  // Show the completion in the input: typed text + selected tail, so typing on replaces it. Runs
  // after every render because React puts the controlled value back each time.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el || !completion || el.value !== query) return;
    const typed = query.trim();
    if (!completion.text.toLowerCase().startsWith(typed.toLowerCase())) return;
    el.value = completion.text;
    el.setSelectionRange(typed.length, completion.text.length);
  });

  // Selection follows a row, not an index: results arriving later never move it under the cursor.
  const [sel, setSel] = useState<{ query: string; id: string }>({ query: '', id: '' });
  const foundIdx = sel.query === query ? rows.findIndex((r) => r.id === sel.id) : -1;
  const selected = foundIdx >= 0 ? foundIdx : 0;
  const select = (i: number): void => {
    const row = rows[Math.max(0, Math.min(rows.length - 1, i))];
    if (row) setSel({ query, id: row.id });
  };
  const hover = useHoverSelect((i) => {
    if (i !== selected) select(i);
  });
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    listRef.current?.querySelector(`#cmd-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const enterSite = (s: SiteSearch): void => {
    setSite(s);
    setQuery('');
    setSuggestions({ query: '', list: [] });
    inputRef.current?.focus();
  };

  const hide = (): void => void invoke('overlay/hide', undefined);

  const openUrl = (url: string, how: Open): void => {
    if (how === 'background') {
      void invoke('tab/openUrl', { input: url, activate: false });
    } else if (how === 'split' || mode === 'split') {
      void invoke('tab/openUrl', { input: url, activate: false, noAtc: true }).then((id) => {
        dispatch({ type: 'split/add', spaceId: core.activeSpaceId, tabId: id });
        dispatch({ type: 'tab/activate', id, now: Date.now() });
      });
    } else if (mode === 'edit' && payload.tabId) {
      void invoke('tab/navigate', { tabId: payload.tabId, input: url });
    } else {
      void invoke('tab/openUrl', { input: url });
    }
    hide();
  };

  const learn = (row: OmniRow): void => {
    const input = learnable(query);
    const target = row.url ?? row.id;
    if (!input || showingEditUrl || /^(search|suggestion|answer|site|sitesearch|siteopen):/.test(row.id))
      return;
    void invoke('omnibox/learn', { input, url: target, spaceId });
  };

  const run = (row: OmniRow | undefined, how: Open = 'default'): void => {
    if (!row) return;
    const [kind, ...rest] = row.id.split(':');
    const value = rest.join(':');
    learn(row);
    switch (kind) {
      case 'site': {
        const s = sites.find((x) => x.id === value);
        if (s) enterSite(s);
        return;
      }
      case 'sitesearch':
        if (site) openUrl(siteSearchUrl(site, value), how);
        return;
      case 'siteopen':
        openUrl(value, how);
        return;
      case 'tab':
        if (how === 'split' || mode === 'split') {
          dispatch({ type: 'split/add', spaceId: core.activeSpaceId, tabId: value });
        } else if (how === 'background' && row.url) {
          openUrl(row.url, 'background');
          return;
        } else {
          dispatch({ type: 'tab/activate', id: value, now: Date.now() });
        }
        hide();
        return;
      case 'archived':
      case 'closed':
        if (how !== 'default' && row.url) {
          openUrl(row.url, how);
          return;
        }
        dispatch({ type: 'archive/restore', id: value, newTabId: crypto.randomUUID(), now: Date.now() });
        hide();
        return;
      case 'cmd':
        hide();
        void invoke('command/run', { id: value });
        return;
      case 'space':
        hide();
        void invoke('command/run', { id: 'activateSpace', payload: { spaceId: value } });
        return;
      case 'move':
        if (activeTab) {
          dispatch({
            type: 'tab/move',
            id: activeTab.id,
            to: { container: { kind: 'today', spaceId: value }, index: 0 },
            now: Date.now(),
          });
        }
        hide();
        return;
      case 'answer':
        if (row.answer) {
          hide();
          void invoke('command/run', { id: 'copyText', payload: { text: answerValue(row, locale).plain } });
        }
        return;
      case 'search':
      case 'suggestion':
        if (engine) openUrl(searchUrl(value, engine), how);
        return;
      case 'history':
      case 'url':
        openUrl(row.url ?? value, how);
        return;
      default:
        openUrl(query, how);
    }
  };

  const removeFromHistory = (row: OmniRow): void => {
    if (row.kind !== 'history' || !row.url) return;
    void invoke('history/delete', { url: row.url }).then(() => setDataVersion((v) => v + 1));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    // Confirming an IME conversion (CJK) must never submit or move the selection.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const el = e.currentTarget;
    const completed =
      !!completion && el.value === completion.text && el.selectionStart === query.trim().length;
    if (e.key === 'Tab' && keywordSite && !e.shiftKey) {
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
    if (completed && (e.key === 'ArrowRight' || e.key === 'End' || e.key === 'Tab')) {
      e.preventDefault();
      changeQuery(completion.text);
      return;
    }
    if (completed && (e.key === 'Backspace' || e.key === 'Delete') && !e.shiftKey) {
      e.preventDefault();
      el.value = query;
      setCompletes(false);
      return;
    }
    const mod = isMac ? e.metaKey : e.ctrlKey;
    // Emacs-style ⌃N / ⌃P, as in every macOS text field and Arc's bar.
    const down = e.key === 'ArrowDown' || (isMac && e.ctrlKey && e.key === 'n');
    const up = e.key === 'ArrowUp' || (isMac && e.ctrlKey && e.key === 'p');
    if (down) {
      e.preventDefault();
      select(selected + 1);
    } else if (up) {
      e.preventDefault();
      select(selected - 1);
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault();
      select(e.key === 'PageDown' ? rows.length - 1 : 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(
        rows[selected] ?? rows[0],
        e.shiftKey && mode !== 'split' ? 'split' : mod ? 'background' : 'default',
      );
    } else if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      e.shiftKey &&
      rows[selected]?.kind === 'history'
    ) {
      e.preventDefault();
      const row = rows[selected];
      if (row) removeFromHistory(row);
    } else if (e.key === 'Tab') {
      // Tab fills the input with the selected suggestion or page, ready to refine.
      const row = rows[selected];
      if (!row || row.kind === 'command' || row.kind === 'answer' || row.kind === 'space') return;
      e.preventDefault();
      changeQuery(
        row.kind === 'search' || row.kind === 'suggestion' || !row.url ? row.title : displayUrl(row.url),
      );
    }
  };

  const placeholder = site
    ? t('overlay.commandBar.placeholderSite', { name: site.name })
    : mode === 'split'
      ? t('overlay.commandBar.placeholderSplit')
      : t('overlay.commandBar.placeholder');
  const tint = site ? ({ '--space-from': site.color } as React.CSSProperties) : undefined;
  const engineName = engine?.name ?? '';
  const selectedRow = rows[selected];
  const home = !query.trim() || showingEditUrl;

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
            onChange={(e) => changeQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            autoComplete="off"
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls="cmd-results"
            aria-activedescendant={rows[selected] ? `cmd-${selected}` : undefined}
            aria-autocomplete="both"
            data-testid="command-input"
          />
          {mode === 'split' && <span className={styles.badge}>{t('overlay.commandBar.badgeSplit')}</span>}
        </div>
        {rows.length > 0 && (
          <ul className={styles.results} id="cmd-results" role="listbox" style={tint} ref={listRef}>
            {rows.map((row, i) => {
              const prev = rows[i - 1];
              const header = home && row.group !== prev?.group ? groupLabel(row.group, t) : null;
              const divider = !home && i > 0 && row.group === 'search' && prev?.group !== 'search';
              return (
                <Fragment key={row.id}>
                  {header && (
                    <li className={styles.groupLabel} role="presentation">
                      {header}
                    </li>
                  )}
                  {divider && <li className={styles.divider} role="presentation" />}
                  <li
                    id={`cmd-${i}`}
                    role="option"
                    aria-selected={i === selected}
                    className={`${styles.item} ${i === selected ? styles.selected : ''} ${row.kind === 'answer' ? styles.answerItem : ''}`}
                    onMouseMove={(e) => hover(i, e)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) =>
                      run(
                        row,
                        e.shiftKey && mode !== 'split'
                          ? 'split'
                          : (isMac ? e.metaKey : e.ctrlKey)
                            ? 'background'
                            : 'default',
                      )
                    }
                    data-testid="command-result"
                    data-kind={row.kind}
                  >
                    <RowIcon row={row} core={core} sites={sites} />
                    <RowText
                      row={row}
                      t={t}
                      engineName={engineName}
                      locale={locale}
                      entries={commands.entries}
                    />
                    <RowAside row={row} selected={i === selected} t={t} entries={commands.entries} />
                  </li>
                </Fragment>
              );
            })}
          </ul>
        )}
        {rows.length === 0 && !query && <div className={styles.hint}>{t('overlay.commandBar.hint')}</div>}
        {rows.length > 0 && (
          <div className={styles.footer} aria-hidden="true">
            <span>
              <kbd>↵</kbd> {selectedRow ? actionLabel(selectedRow, mode, t) : t('common.open')}
            </span>
            {mode !== 'split' && selectedRow && opensPage(selectedRow) && (
              <span>
                <kbd>⇧↵</kbd> {t('overlay.commandBar.footer.split')}
              </span>
            )}
            {selectedRow && opensPage(selectedRow) && (
              <span>
                <kbd>{isMac ? '⌘↵' : 'Ctrl+↵'}</kbd> {t('overlay.commandBar.footer.background')}
              </span>
            )}
            {selectedRow?.kind === 'history' && (
              <span>
                <kbd>⇧⌫</kbd> {t('overlay.commandBar.footer.remove')}
              </span>
            )}
            {!site && (
              <span className={styles.footerEnd}>
                <kbd>&gt;</kbd> {t('overlay.commandBar.footer.commands')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function opensPage(row: OmniRow): boolean {
  return (
    row.kind !== 'command' && row.kind !== 'space' && row.kind !== 'answer' && !row.id.startsWith('site:')
  );
}

function siteRows(
  site: SiteSearch,
  q: string,
  recent: { siteId: string; query: string; items: string[] },
  suggestions: { query: string; list: string[] },
): OmniRow[] {
  const row = (id: string, kind: OmniRow['kind'], title: string): OmniRow => ({
    id,
    kind,
    group: 'search',
    title,
    titleRanges: [],
    urlRanges: [],
    score: 0,
  });
  const list: OmniRow[] = [
    q ? row(`sitesearch:${q}`, 'search', q) : row(`siteopen:${siteHomeUrl(site)}`, 'url', site.name),
  ];
  const lower = q.toLowerCase();
  const seen = new Set([lower]);
  for (const text of recent.siteId === site.id && recent.query === lower ? recent.items : []) {
    if (seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    list.push(row(`sitesearch:${text}`, 'history', text));
  }
  for (const text of suggestions.query === q ? suggestions.list : []) {
    if (seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    list.push(row(`sitesearch:${text}`, 'suggestion', text));
  }
  return list.slice(0, 10);
}

function groupLabel(group: OmniRow['group'], t: ReturnType<typeof useT>): string | null {
  switch (group) {
    case 'tabs':
      return t('overlay.commandBar.group.tabs');
    case 'frequent':
      return t('overlay.commandBar.group.frequent');
    case 'closed':
      return t('overlay.commandBar.group.closed');
    default:
      return null;
  }
}

function actionLabel(row: OmniRow, mode: CommandBarPayload['mode'], t: ReturnType<typeof useT>): string {
  if (row.kind === 'answer') return t('common.copy');
  if (row.kind === 'command' || row.kind === 'space') return t('overlay.commandBar.footer.run');
  if ((row.kind === 'tab' || row.kind === 'pinned' || row.kind === 'favorite') && mode !== 'split') {
    return t('overlay.commandBar.switchToTab');
  }
  if (row.kind === 'search' || row.kind === 'suggestion') return t('overlay.commandBar.footer.search');
  return t('common.open');
}

function highlight(text: string, ranges: readonly Range[]): ReactNode {
  if (!ranges.length) return text;
  const out: ReactNode[] = [];
  let at = 0;
  for (const [s, e] of ranges) {
    if (s > at) out.push(text.slice(at, s));
    out.push(
      <mark key={s} className={styles.hl}>
        {text.slice(s, e)}
      </mark>,
    );
    at = e;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

function answerValue(row: OmniRow, locale: string): { shown: string; plain: string; detail: string } {
  const a = row.answer;
  if (!a) return { shown: '', plain: '', detail: '' };
  const fmt = (v: number, digits: number): string =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(roundAnswer(v));
  if (a.kind === 'calc') {
    const plain = String(roundAnswer(a.value));
    return { shown: fmt(a.value, 10), plain, detail: a.expression };
  }
  const result = fmt(a.result, 4);
  return { shown: `${result} ${a.to}`, plain: `${result} ${a.to}`, detail: `${fmt(a.value, 4)} ${a.from}` };
}

function RowText({
  row,
  t,
  engineName,
  locale,
  entries,
}: {
  row: OmniRow;
  t: ReturnType<typeof useT>;
  engineName: string;
  locale: string;
  entries: { id: string; accelerator: string | null }[];
}) {
  let title: ReactNode = highlight(row.title, row.titleRanges);
  let subtitle: ReactNode = null;
  switch (row.kind) {
    case 'answer': {
      const v = answerValue(row, locale);
      title = <span className={styles.answer}>= {v.shown}</span>;
      subtitle = v.detail;
      break;
    }
    case 'search':
    case 'suggestion':
      subtitle = row.id.startsWith('site')
        ? null
        : t('overlay.commandBar.searchWith', { engine: engineName });
      break;
    case 'url':
      title = row.url ? displayUrl(row.url) : row.title;
      subtitle = row.id.startsWith('siteopen:') ? null : t('overlay.commandBar.openWebsite');
      break;
    case 'command':
      subtitle =
        entries.some((e) => `cmd:${e.id}` === row.id) || row.id.startsWith('move:')
          ? t('overlay.commandBar.commandSubtitle')
          : null;
      break;
    case 'space':
      subtitle = t('overlay.commandBar.switchSpace');
      break;
    default:
      if (row.url) subtitle = highlight(displayUrl(row.url), row.urlRanges);
  }
  return (
    <>
      <span className={styles.title}>{title}</span>
      {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
    </>
  );
}

function RowAside({
  row,
  selected,
  t,
  entries,
}: {
  row: OmniRow;
  selected: boolean;
  t: ReturnType<typeof useT>;
  entries: { id: string; accelerator: string | null }[];
}) {
  let tag: string | null = null;
  if (row.kind === 'tab' || row.kind === 'pinned' || row.kind === 'favorite') {
    tag = row.candidate?.current ? t('overlay.commandBar.currentTab') : t('overlay.commandBar.switchToTab');
  } else if (row.kind === 'archived') {
    tag = t('overlay.commandBar.archived');
  } else if (row.kind === 'answer') {
    tag = t('common.copy');
  }
  const acc = row.kind === 'command' ? entries.find((e) => `cmd:${e.id}` === row.id)?.accelerator : null;
  return (
    <span className={styles.aside}>
      {tag && <span className={styles.tag}>{tag}</span>}
      {acc && <kbd className={styles.acc}>{acceleratorLabel(acc)}</kbd>}
      {selected && <kbd className={styles.enter}>↵</kbd>}
    </span>
  );
}

function RowIcon({
  row,
  core,
  sites,
}: {
  row: OmniRow;
  core: ReturnType<typeof useShell.getState>['core'];
  sites: readonly SiteSearch[];
}) {
  const [kind, value] = row.id.split(':', 2);
  if (kind === 'site') {
    const s = sites.find((x) => x.id === value);
    return <span className={styles.dot} style={{ background: s?.color }} aria-hidden="true" />;
  }
  if (kind === 'tab') {
    const tab = core.tabs[value ?? ''];
    if (tab) return <Favicon tab={tab} size={18} />;
  }
  if (kind === 'space') {
    const sp = core.spaces[value ?? ''];
    return (
      <span className={styles.spaceIcon} aria-hidden="true">
        {sp?.emoji || '◆'}
      </span>
    );
  }
  if (
    (kind === 'history' || kind === 'archived' || kind === 'closed' || kind === 'url') &&
    row.url &&
    /^https?:/i.test(row.url)
  ) {
    return (
      <Favicon
        tab={{ url: row.url, favicon: row.favicon ?? null, emoji: null, sleeping: false, loading: false }}
        size={18}
      />
    );
  }
  let icon: IconName = 'search';
  if (kind === 'cmd') icon = COMMAND_ICONS[value ?? ''] ?? 'command';
  else if (kind === 'move') icon = 'send';
  else if (kind === 'answer') icon = 'sparkle';
  else if (row.kind === 'history') icon = 'history';
  else if (kind === 'url' || kind === 'siteopen') icon = 'globe';
  else if (kind === 'archived' || kind === 'closed') icon = 'archive';
  return <Icon name={icon} size={16} className={styles.kindIcon} />;
}
