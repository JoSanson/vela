/**
 * Fuzzy ranking for the command bar. Pure, allocation-light, designed for < 30 ms on 10k items.
 */
export type SearchItemKind =
  'tab' | 'archived' | 'history' | 'favorite' | 'command' | 'url' | 'search' | 'suggestion';

export interface SearchItem {
  id: string;
  kind: SearchItemKind;
  title: string;
  subtitle: string;
  /** Pre-lowercased search key (title + subtitle). Built once via `makeSearchItem`. */
  key: string;
  /** Recency / frequency bonus in [0, 1]. */
  boost: number;
}

export interface RankedItem {
  item: SearchItem;
  score: number;
}

export function makeSearchItem(init: Omit<SearchItem, 'key'> & { key?: string }): SearchItem {
  return { ...init, key: init.key ?? `${init.title} ${init.subtitle}`.toLowerCase() };
}

const KIND_WEIGHT: Record<SearchItemKind, number> = {
  tab: 1.0,
  command: 0.95,
  favorite: 0.9,
  archived: 0.7,
  history: 0.65,
  suggestion: 0.5,
  url: 0.4,
  search: 0.3,
};

/**
 * Scores `query` against `key`. Returns 0 for no match.
 * Prefix and word-boundary matches rank far above scattered subsequence matches.
 */
export function fuzzyScore(query: string, key: string): number {
  if (!query) return 0;
  const direct = key.indexOf(query);
  if (direct === 0) return 1;
  if (direct > 0) {
    const prev = key.charCodeAt(direct - 1);
    const atWord = prev === 32 || prev === 47 || prev === 46 || prev === 45 || prev === 95;
    return atWord ? 0.9 : 0.75;
  }
  let qi = 0;
  let score = 0;
  let lastMatch = -2;
  for (let i = 0; i < key.length && qi < query.length; i++) {
    if (key.charCodeAt(i) === query.charCodeAt(qi)) {
      const prev = i === 0 ? 32 : key.charCodeAt(i - 1);
      const atWord = prev === 32 || prev === 47 || prev === 46 || prev === 45 || prev === 95;
      score += i === lastMatch + 1 ? 2 : atWord ? 1.5 : 1;
      lastMatch = i;
      qi++;
    }
  }
  if (qi < query.length) return 0;
  const maxScore = query.length * 2;
  return 0.6 * (score / maxScore) * Math.min(1, 12 / Math.max(12, key.length / 4));
}

export function rankItems(query: string, items: readonly SearchItem[], limit = 20): RankedItem[] {
  const q = query.trim().toLowerCase();
  const out: RankedItem[] = [];
  if (!q) {
    for (const item of items) {
      if (item.kind === 'tab' || item.kind === 'command' || item.kind === 'favorite') {
        out.push({ item, score: KIND_WEIGHT[item.kind] + item.boost });
      }
    }
  } else {
    for (const item of items) {
      const s = fuzzyScore(q, item.key);
      if (s === 0) continue;
      out.push({ item, score: s * KIND_WEIGHT[item.kind] + item.boost * 0.15 });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.length > limit ? out.slice(0, limit) : out;
}
