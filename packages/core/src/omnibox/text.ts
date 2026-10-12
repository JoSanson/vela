/**
 * Text matching for the command bar: accent- and case-insensitive, word-order free, typo tolerant.
 * Pure and allocation-light: a field is prepared once, then matched against every keystroke.
 */

export interface PreparedText {
  /** Original text. */
  raw: string;
  /** Lowercased, diacritics stripped. */
  norm: string;
  /** `map[i]` = index in `raw` of the character that produced `norm[i]`. */
  map: Uint32Array;
  /** Start offsets (in `norm`) of every word. */
  words: Uint32Array;
}

export type Range = [start: number, end: number];

export interface FieldMatch {
  score: number;
  /** Matched ranges in the field's raw text, merged and sorted. */
  ranges: Range[];
}

const MARK_RE = /\p{M}/u;

/** Lowercase + strip diacritics: "Café Été" → "cafe ete". */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function isWordChar(code: number): boolean {
  return (
    (code >= 48 && code <= 57) || (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || code > 127
  );
}

export function prepareText(raw: string): PreparedText {
  let norm = '';
  const map: number[] = [];
  let i = 0;
  for (const ch of raw) {
    const n = ch.normalize('NFD').toLowerCase();
    for (const c of n) {
      if (MARK_RE.test(c)) continue;
      norm += c;
      map.push(...Array.from({ length: c.length }, () => i));
    }
    i += ch.length;
  }
  const words: number[] = [];
  for (let j = 0; j < norm.length; j++) {
    const code = norm.charCodeAt(j);
    if (isWordChar(code) && (j === 0 || !isWordChar(norm.charCodeAt(j - 1)))) words.push(j);
  }
  return { raw, norm, map: Uint32Array.from(map), words: Uint32Array.from(words) };
}

/** Query tokens, normalized. Separators are whitespace only: `github.com/vela` stays one token. */
export function tokenize(query: string): string[] {
  return normalizeText(query).split(/\s+/).filter(Boolean);
}

/**
 * Optimal string alignment distance between `a` and the first `a.length` (±1) chars of `b`,
 * capped at `max` (returns max + 1 beyond). Prefix-aware so "githb" matches "github" while typing.
 */
export function prefixEditDistance(a: string, b: string, max: number): number {
  const n = a.length;
  const m = Math.min(b.length, n + max);
  if (n - m > max) return max + 1;
  // Each edit fixes at most one missing character: cheap rejection before the DP.
  let present = 0;
  for (let i = 0; i < n; i++) {
    const at = b.indexOf(a.charAt(i));
    if (at >= 0 && at < m) present++;
  }
  if (present < n - max) return max + 1;
  if (rows[0].length < m + 1) for (let r = 0; r < 3; r++) rows[r] = new Int32Array(m + 16);
  let prev2 = rows[0];
  let prev = rows[1];
  let cur = rows[2];
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    let rowMin = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const bj = b.charCodeAt(j - 1);
      let v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (ai === bj ? 0 : 1));
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === bj) {
        v = Math.min(v, (prev2[j - 2] ?? 0) + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    [prev2, prev, cur] = [prev, cur, prev2];
  }
  // Best over b's prefixes of length n-max … n+max: the typed text may be one char short or long.
  let best = max + 1;
  for (let j = Math.max(0, n - max); j <= m; j++) best = Math.min(best, prev[j] ?? 0);
  return best;
}

const rows: [Int32Array, Int32Array, Int32Array] = [
  new Int32Array(64),
  new Int32Array(64),
  new Int32Array(64),
];

export const SCORE = {
  fieldPrefix: 1,
  wordPrefix: 0.9,
  substring: 0.7,
  typo: 0.55,
  acronym: 0.6,
} as const;

/** Best match of one normalized token in a prepared field; null when it does not match. */
function matchToken(token: string, f: PreparedText): { score: number; start: number; end: number } | null {
  const { norm, words } = f;
  if (norm.startsWith(token)) return { score: SCORE.fieldPrefix, start: 0, end: token.length };
  for (const s of words) {
    if (norm.startsWith(token, s)) return { score: SCORE.wordPrefix, start: s, end: s + token.length };
  }
  if (token.length >= 2) {
    const at = norm.indexOf(token);
    if (at >= 0) return { score: SCORE.substring, start: at, end: at + token.length };
  }
  if (token.length >= 4) {
    const max = token.length >= 8 ? 2 : 1;
    for (const s of words) {
      if (norm.charCodeAt(s) !== token.charCodeAt(0) && token.length < 6) continue;
      const end = Math.min(norm.length, s + token.length + max);
      const word = norm.slice(s, end);
      if (prefixEditDistance(token, word, max) <= max) {
        return {
          score: SCORE.typo - 0.05 * (max - 1),
          start: s,
          end: Math.min(norm.length, s + token.length),
        };
      }
    }
  }
  return null;
}

/** Initials: "gd" → "Google Docs", "yt" → "YouTube" is not (single word), "hn" → "Hacker News". */
function matchAcronym(token: string, f: PreparedText): Range[] | null {
  if (token.length < 2 || token.length > f.words.length) return null;
  const hits: Range[] = [];
  let ti = 0;
  for (let w = 0; w < f.words.length && ti < token.length; w++) {
    const s = f.words[w] ?? 0;
    if (f.norm.charCodeAt(s) === token.charCodeAt(ti)) {
      hits.push([s, s + 1]);
      ti++;
    }
  }
  return ti === token.length ? hits : null;
}

export function mergeRanges(ranges: Range[]): Range[] {
  const out: Range[] = [];
  for (const [s, e] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

function toRawRanges(f: PreparedText, ranges: Range[]): Range[] {
  return mergeRanges(
    ranges.map(([s, e]): Range => {
      const rs = f.map[s] ?? 0;
      const last = e > 0 ? (f.map[e - 1] ?? rs) : rs;
      return [rs, last + ((f.raw.codePointAt(last) ?? 0) > 0xffff ? 2 : 1)];
    }),
  );
}

/**
 * Every token must match somewhere in the field (any order). Score = mean token score, with the
 * whole query matched contiguously scoring as a single token.
 */
export function matchField(tokens: readonly string[], f: PreparedText): FieldMatch | null {
  if (tokens.length === 0) return null;
  if (tokens.length > 1) {
    const whole = tokens.join(' ');
    const m = matchToken(whole, f);
    if (m && m.score >= SCORE.substring) {
      return { score: m.score, ranges: toRawRanges(f, [[m.start, m.end]]) };
    }
  }
  let total = 0;
  const ranges: Range[] = [];
  for (const t of tokens) {
    const m = matchToken(t, f);
    if (m) {
      total += m.score;
      ranges.push([m.start, m.end]);
      continue;
    }
    const acro = tokens.length === 1 ? matchAcronym(t, f) : null;
    if (!acro) return null;
    total += SCORE.acronym;
    ranges.push(...acro);
  }
  return { score: total / tokens.length, ranges: toRawRanges(f, ranges) };
}

/**
 * Tokens may be split across fields ("vela github" → title "vela", URL "github.com").
 * Returns the best per-token score over all fields, or null if any token matches nowhere.
 */
export function matchFields(
  tokens: readonly string[],
  fields: readonly (PreparedText | null)[],
): { score: number; perField: (Range[] | null)[] } | null {
  const perField: (Range[] | null)[] = fields.map(() => null);
  let best: { score: number; field: number; ranges: Range[] } | null = null;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (!f) continue;
    const m = matchField(tokens, f);
    if (m && (!best || m.score > best.score)) best = { score: m.score, field: i, ranges: m.ranges };
  }
  if (best) {
    perField[best.field] = best.ranges;
    return { score: best.score, perField };
  }
  if (tokens.length < 2) return null;
  let total = 0;
  for (const t of tokens) {
    let tokenBest: { score: number; field: number; ranges: Range[] } | null = null;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (!f) continue;
      const m = matchField([t], f);
      if (m && (!tokenBest || m.score > tokenBest.score)) {
        tokenBest = { score: m.score, field: i, ranges: m.ranges };
      }
    }
    if (!tokenBest) return null;
    total += tokenBest.score;
    perField[tokenBest.field] = mergeRanges([...(perField[tokenBest.field] ?? []), ...tokenBest.ranges]);
  }
  // Split across fields is a little weaker than all tokens in one field.
  return { score: (total / tokens.length) * 0.95, perField };
}
