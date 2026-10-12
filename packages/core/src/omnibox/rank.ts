import { instantAnswer, type Answer } from './answers';
import { matchFields, prepareText, tokenize, type PreparedText, type Range } from './text';

/**
 * The command bar's brain. Every source (tabs, history, archive, commands, Spaces) becomes an
 * `OmniCandidate`; this module scores them on text match, frecency and what the user picked
 * before for the same input, merges duplicates by URL and decides what Enter does.
 */

export type CandidateKind =
  'tab' | 'pinned' | 'favorite' | 'history' | 'archived' | 'closed' | 'command' | 'space';
export type RowKind = CandidateKind | 'search' | 'url' | 'suggestion' | 'answer';
export type RowGroup = 'answer' | 'top' | 'nav' | 'search' | 'tabs' | 'frequent' | 'closed';

export interface OmniCandidate {
  /** Action id understood by the caller: `tab:<id>`, `history:<url>`, `cmd:<id>`… */
  id: string;
  kind: CandidateKind;
  title: string;
  url?: string;
  /** Extra searchable words: English aliases of a command, a Space's name… */
  keywords?: string;
  visitCount?: number;
  /** Last visit (history) or last activation (tabs), ms. */
  lastVisit?: number;
  favicon?: string | null;
  /** The tab on screen: listed, never the default. */
  current?: boolean;
  /** Destructive commands (close all, clear cookies): listed, never what a bare Enter does. */
  noDefault?: boolean;
}

/** One past pick: the user typed `input` (normalized) and chose `url`. */
export interface InputUse {
  input: string;
  url: string;
  uses: number;
  lastUsed: number;
}

export interface OmniRow {
  id: string;
  kind: RowKind;
  group: RowGroup;
  title: string;
  url?: string;
  favicon?: string | null;
  /** Matched ranges in `title` / in the displayed URL (`displayUrl(url)`), for bold rendering. */
  titleRanges: Range[];
  urlRanges: Range[];
  answer?: Answer;
  candidate?: OmniCandidate;
  score: number;
}

export interface OmniInput {
  query: string;
  now: number;
  candidates: readonly OmniCandidate[];
  inputs?: readonly InputUse[];
  suggestions?: readonly string[];
  /** The query as the browser would resolve it on Enter (`resolveInput`). */
  typed?: { url: string; isSearch: boolean } | null;
  /** Max navigation rows (tabs, history, commands…). */
  maxNav?: number;
  maxSuggestions?: number;
  /** False after the user deleted a completion: do not offer it again for this text. */
  complete?: boolean;
}

export interface OmniResult {
  rows: OmniRow[];
  /** Inline completion: the input shows `text` with the untyped tail selected; Enter opens `url`. */
  completion: { text: string; url: string } | null;
  /** `>` prefix: commands only. `?` prefix: search only. */
  scope: 'all' | 'commands' | 'search';
}

const DAY = 86_400_000;
/** About three recent visits, or an open tab: one click on a link is not enough to guess a site. */
const INLINE_MIN = 0.35;

/** Scheme-less, `www.`-less, hash-less, trailing-slash-less, lowercased: one key per page. */
export function urlKey(url: string): string {
  return url
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/#.*$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

/** The URL as shown and matched in the bar: scheme-less for http(s), decoded, no trailing slash. */
export function displayUrl(url: string): string {
  if (!/^https?:\/\//i.test(url)) return url;
  let s = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  try {
    s = decodeURI(s);
  } catch {
    /* keep encoded */
  }
  return s.replace(/\/$/, '');
}

/** Firefox-style frecency in [0, 1): visit count, weighted by how recent the last visit is. */
export function frecency(visitCount: number, lastVisit: number, now: number): number {
  if (visitCount <= 0) return 0;
  const age = (now - lastVisit) / DAY;
  const bucket = age < 4 ? 100 : age < 14 ? 70 : age < 31 ? 50 : age < 90 ? 30 : 10;
  return 1 - Math.exp(-(bucket * Math.log2(1 + visitCount)) / 400);
}

/**
 * Adaptive history: past picks whose input starts with what is typed now, decayed by age (30-day
 * half-life) and by how much of that input is typed. Returns url key → score in [0, 1).
 */
export function adaptiveScores(query: string, inputs: readonly InputUse[], now: number): Map<string, number> {
  const q = tokenize(query).join(' ');
  const acc = new Map<string, number>();
  if (!q) return acc;
  for (const use of inputs) {
    if (!use.input.startsWith(q)) continue;
    const closeness = q.length / use.input.length;
    const decay = 0.5 ** (Math.max(0, now - use.lastUsed) / (30 * DAY));
    const key = urlKey(use.url);
    acc.set(key, (acc.get(key) ?? 0) + use.uses * decay * (0.5 + 0.5 * closeness));
  }
  for (const [k, v] of acc) acc.set(k, 1 - Math.exp(-v / 1.5));
  return acc;
}

interface Prepared {
  title: PreparedText;
  url: PreparedText | null;
  keywords: PreparedText | null;
}

const prepCache = new WeakMap<OmniCandidate, Prepared>();

function prepared(c: OmniCandidate): Prepared {
  let p = prepCache.get(c);
  if (!p) {
    p = {
      title: prepareText(c.title),
      url: c.url ? prepareText(displayUrl(c.url)) : null,
      keywords: c.keywords ? prepareText(c.keywords) : null,
    };
    prepCache.set(c, p);
  }
  return p;
}

const KIND_PRIOR: Record<CandidateKind, number> = {
  tab: 0.12,
  pinned: 0.12,
  favorite: 0.12,
  command: 0.06,
  space: 0.06,
  history: 0,
  closed: -0.04,
  archived: -0.08,
};

/** Which candidate represents a page found under several sources. */
const KIND_RANK: Record<CandidateKind, number> = {
  tab: 0,
  pinned: 0,
  favorite: 1,
  history: 2,
  closed: 3,
  archived: 4,
  command: 5,
  space: 5,
};

const isOpen = (k: CandidateKind): boolean => k === 'tab' || k === 'pinned' || k === 'favorite';

interface Scored {
  c: OmniCandidate;
  key: string;
  m: number;
  f: number;
  a: number;
  hostPrefix: boolean;
  titleRanges: Range[];
  urlRanges: Range[];
  score: number;
}

function scoreOf(s: Omit<Scored, 'score'>): number {
  const k = s.c.kind;
  const prior = k === 'command' || k === 'space' ? (s.m >= 0.9 ? KIND_PRIOR[k] : -0.1) : KIND_PRIOR[k];
  return 0.55 * s.m + 0.25 * s.f + s.a + prior + (s.hostPrefix ? 0.08 : 0) - (s.c.current ? 0.2 : 0);
}

/** Can this match be what Enter does, ahead of "search for what I typed"? */
function eligibleDefault(s: Scored, query: string): boolean {
  if (s.c.current || s.c.noDefault) return false;
  if (s.a >= 0.3) return true;
  switch (s.c.kind) {
    case 'tab':
    case 'pinned':
    case 'favorite':
      return s.m >= 0.9;
    case 'command':
      return s.m >= 1 && query.trim().length >= 3;
    case 'space':
      // "work" is more often a search than a wish to change Space, unless it is the Space's name.
      return tokenize(query).join(' ') === tokenize(s.c.title).join(' ');
    default:
      return s.hostPrefix && s.f >= INLINE_MIN;
  }
}

function lastPathSegmentless(key: string): string {
  const i = key.indexOf('/');
  return i < 0 ? key : key.slice(0, i);
}

/**
 * Inline completion from the URLs the user knows: "git" → "github.com", "github.com/ve" →
 * "github.com/velabrowser/vela". Host-level unless the typed text already has a path.
 */
export function inlineCompletion(
  query: string,
  candidates: readonly OmniCandidate[],
  adaptive: ReadonlyMap<string, number>,
  now: number,
): { text: string; url: string } | null {
  const typed = query.trim();
  if (!typed || /\s/.test(typed) || /^[a-z][a-z0-9+.-]*:/i.test(typed) || typed.startsWith('?')) return null;
  const typedLower = typed.toLowerCase().replace(/^www\./, '');
  const withPath = typedLower.includes('/');
  let best: { key: string; url: string; weight: number } | null = null;
  const hosts = new Map<string, { url: string; weight: number; root: string | null }>();
  for (const c of candidates) {
    if (!c.url || !/^https?:\/\//i.test(c.url)) continue;
    const key = urlKey(c.url);
    const f = frecency(c.visitCount ?? 1, c.lastVisit ?? 0, now) + (isOpen(c.kind) ? 0.3 : 0);
    const weight = f + (adaptive.get(key) ?? 0);
    if (withPath) {
      if (key.startsWith(typedLower) && key !== typedLower && (!best || weight > best.weight)) {
        best = { key, url: c.url, weight };
      }
      continue;
    }
    const host = lastPathSegmentless(key);
    if (!host.startsWith(typedLower)) continue;
    const h = hosts.get(host) ?? { url: c.url, weight: 0, root: null };
    h.weight += weight;
    if (key === host) h.root = c.url;
    hosts.set(host, h);
  }
  if (!withPath) {
    for (const [host, h] of hosts) {
      if (host === typedLower) continue;
      if (!best || h.weight > best.weight) {
        let url = h.root;
        if (!url) {
          try {
            url = `${new URL(h.url).origin}/`;
          } catch {
            continue;
          }
        }
        best = { key: host, url, weight: h.weight };
      }
    }
  }
  // One char is too little to guess from, unless the user has picked this before.
  if (!best || (typedLower.length < 2 && (adaptive.get(best.key) ?? 0) < 0.3) || best.weight < INLINE_MIN)
    return null;
  const shown = withPath ? displayUrl(best.url) : lastPathSegmentless(displayUrl(best.url));
  const tail = shown.toLowerCase().startsWith(typedLower)
    ? shown.slice(typedLower.length)
    : best.key.slice(typedLower.length);
  return tail ? { text: typed + tail, url: best.url } : null;
}

function scoreAll(
  query: string,
  candidates: readonly OmniCandidate[],
  adaptive: Map<string, number>,
  now: number,
): Scored[] {
  const tokens = tokenize(query);
  const qJoined = tokens.join('');
  const out: Scored[] = [];
  for (const c of candidates) {
    const p = prepared(c);
    const key = urlKey(c.url ?? c.id);
    const a = adaptive.get(key) ?? 0;
    const match = tokens.length ? matchFields(tokens, [p.title, p.url, p.keywords]) : null;
    if (!match && a === 0) continue;
    const hostPrefix = !!p.url && tokens.length === 1 && p.url.norm.startsWith(qJoined);
    const s = {
      c,
      key,
      m: match?.score ?? 0,
      f:
        c.visitCount !== undefined || c.lastVisit !== undefined
          ? frecency(c.visitCount ?? 1, c.lastVisit ?? 0, now)
          : 0,
      a,
      hostPrefix,
      titleRanges: match?.perField[0] ?? [],
      urlRanges: match?.perField[1] ?? [],
    };
    out.push({ ...s, score: scoreOf(s) });
  }
  return out;
}

/** Same page from several sources → one row: the open tab wins, carrying history's signals. */
function mergeByKey(scored: Scored[]): Scored[] {
  const groups = new Map<string, Scored>();
  for (const s of scored) {
    const g = groups.get(s.key);
    if (!g) {
      groups.set(s.key, s);
      continue;
    }
    const keep =
      KIND_RANK[s.c.kind] < KIND_RANK[g.c.kind] || (s.c.kind === g.c.kind && s.score > g.score) ? s : g;
    const other = keep === s ? g : s;
    const merged: Omit<Scored, 'score'> = {
      ...keep,
      m: Math.max(keep.m, other.m),
      f: Math.max(keep.f, other.f),
      a: Math.max(keep.a, other.a),
      hostPrefix: keep.hostPrefix || other.hostPrefix,
      titleRanges:
        keep.titleRanges.length || keep.c.title !== other.c.title ? keep.titleRanges : other.titleRanges,
      urlRanges: keep.urlRanges.length ? keep.urlRanges : other.urlRanges,
    };
    groups.set(s.key, { ...merged, score: scoreOf(merged) });
  }
  return [...groups.values()];
}

function toRow(s: Scored, group: RowGroup): OmniRow {
  return {
    id: s.c.id,
    kind: s.c.kind,
    group,
    title: s.c.title,
    ...(s.c.url ? { url: s.c.url } : {}),
    ...(s.c.favicon !== undefined ? { favicon: s.c.favicon } : {}),
    titleRanges: s.titleRanges,
    urlRanges: s.urlRanges,
    candidate: s.c,
    score: s.score,
  };
}

function parseScope(query: string): { scope: OmniResult['scope']; q: string } {
  const t = query.trimStart();
  if (t.startsWith('>')) return { scope: 'commands', q: t.slice(1) };
  if (t.startsWith('?')) return { scope: 'search', q: t.slice(1) };
  return { scope: 'all', q: query };
}

export function rankOmnibox(input: OmniInput): OmniResult {
  const { now } = input;
  const { scope, q } = parseScope(input.query);
  const query = q.trim();
  const inputs = input.inputs ?? [];
  const maxNav = input.maxNav ?? 6;
  const rows: OmniRow[] = [];
  const adaptive = adaptiveScores(query, inputs, now);

  if (scope === 'search') {
    if (query) rows.push(searchRow(query, 'top'));
    for (const s of dedupeSuggestions(query, input.suggestions ?? []).slice(0, input.maxSuggestions ?? 5)) {
      rows.push(suggestionRow(s));
    }
    return { rows, completion: null, scope };
  }

  const pool =
    scope === 'commands'
      ? input.candidates.filter((c) => c.kind === 'command' || c.kind === 'space')
      : input.candidates;
  if (!query) {
    if (scope === 'commands') {
      for (const c of pool)
        rows.push(
          toRow(
            { c, key: c.id, m: 0, f: 0, a: 0, hostPrefix: false, titleRanges: [], urlRanges: [], score: 0 },
            'nav',
          ),
        );
      return { rows, completion: null, scope };
    }
    return { rows: [], completion: null, scope };
  }

  const scored = mergeByKey(scoreAll(query, pool, adaptive, now)).sort((x, y) => y.score - x.score);
  const completion =
    scope === 'all' && input.complete !== false ? inlineCompletion(query, pool, adaptive, now) : null;

  const answer = scope === 'all' ? instantAnswer(query) : null;
  if (answer) {
    rows.push({
      id: `answer:${query}`,
      kind: 'answer',
      group: 'answer',
      title: query,
      titleRanges: [],
      urlRanges: [],
      answer,
      score: 2,
    });
  }

  // What Enter does when nothing is selected.
  let top: OmniRow | null = null;
  const typed = input.typed ?? null;
  const explicitUrl = typed && !typed.isSearch;
  if (completion) {
    const ck = urlKey(completion.url);
    const known = scored.find((s) => s.key === ck && !s.c.current);
    top = known
      ? toRow(known, 'top')
      : {
          id: `url:${completion.url}`,
          kind: 'url',
          group: 'top',
          title: displayUrl(completion.url),
          url: completion.url,
          titleRanges: [],
          urlRanges: [],
          score: 1,
        };
  } else if (explicitUrl && typed) {
    const tk = urlKey(typed.url);
    const open = scored.find((s) => s.key === tk && isOpen(s.c.kind) && !s.c.current);
    top = open
      ? toRow(open, 'top')
      : {
          id: `url:${typed.url}`,
          kind: 'url',
          group: 'top',
          title: displayUrl(typed.url),
          url: typed.url,
          titleRanges: [],
          urlRanges: [],
          score: 1,
        };
  } else {
    const best = scored.find((s) => eligibleDefault(s, query));
    // A past pick for this input wins outright: the user already told us what they mean.
    if (best && (best.a >= 0.3 || best.score >= (scored[0]?.score ?? 0) - 0.15)) top = toRow(best, 'top');
  }
  if (!top && scope === 'all') top = searchRow(query, 'top');
  if (top) rows.push(top);

  let nav = 0;
  for (const s of scored) {
    if (nav >= maxNav) break;
    if (top && (s.c.id === top.id || (s.c.url && top.url && urlKey(s.c.url) === urlKey(top.url)))) continue;
    rows.push(toRow(s, 'nav'));
    nav++;
  }

  if (scope === 'all') {
    if (top?.kind !== 'search') rows.push(searchRow(query, 'search'));
    for (const s of dedupeSuggestions(query, input.suggestions ?? []).slice(0, input.maxSuggestions ?? 4)) {
      rows.push(suggestionRow(s));
    }
  }
  return { rows, completion, scope };
}

function searchRow(query: string, group: RowGroup): OmniRow {
  return {
    id: `search:${query}`,
    kind: 'search',
    group,
    title: query,
    titleRanges: [],
    urlRanges: [],
    score: 0,
  };
}

function suggestionRow(s: string): OmniRow {
  return {
    id: `suggestion:${s}`,
    kind: 'suggestion',
    group: 'search',
    title: s,
    titleRanges: [],
    urlRanges: [],
    score: 0,
  };
}

function dedupeSuggestions(query: string, list: readonly string[]): string[] {
  const seen = new Set([tokenize(query).join(' ')]);
  const out: string[] = [];
  for (const s of list) {
    const k = tokenize(s).join(' ');
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/**
 * The bar with nothing typed: recent tabs, the sites visited most that are not open, recently
 * closed tabs. Each group is capped so the list fits without scrolling.
 */
export function rankHome(
  candidates: readonly OmniCandidate[],
  now: number,
  caps: { tabs?: number; frequent?: number; closed?: number } = {},
): OmniRow[] {
  const blank = (c: OmniCandidate, group: RowGroup, score: number): OmniRow =>
    toRow(
      {
        c,
        key: urlKey(c.url ?? c.id),
        m: 0,
        f: 0,
        a: 0,
        hostPrefix: false,
        titleRanges: [],
        urlRanges: [],
        score,
      },
      group,
    );
  const open = new Set<string>();
  const tabs = candidates
    .filter((c) => isOpen(c.kind))
    .map((c) => {
      if (c.url) open.add(urlKey(c.url));
      return c;
    })
    .filter((c) => !c.current)
    .sort((a, b) => (b.lastVisit ?? 0) - (a.lastVisit ?? 0))
    .slice(0, caps.tabs ?? 4)
    .map((c) => blank(c, 'tabs', c.lastVisit ?? 0));
  const frequent: OmniRow[] = [];
  const seenHosts = new Set<string>();
  for (const c of candidates
    .filter((x) => x.kind === 'history' && x.url && !open.has(urlKey(x.url)))
    .map((c) => ({ c, f: frecency(c.visitCount ?? 1, c.lastVisit ?? 0, now) }))
    .sort((a, b) => b.f - a.f)) {
    // One row per site: the five most frecent pages are often the same inbox.
    const host = lastPathSegmentless(urlKey(c.c.url ?? ''));
    if (seenHosts.has(host)) continue;
    seenHosts.add(host);
    frequent.push(blank(c.c, 'frequent', c.f));
    if (frequent.length >= (caps.frequent ?? 4)) break;
  }
  const closed = candidates
    .filter((c) => c.kind === 'closed' && !(c.url && open.has(urlKey(c.url))))
    .slice(0, caps.closed ?? 2)
    .map((c) => blank(c, 'closed', 0));
  return [...tabs, ...frequent, ...closed];
}
