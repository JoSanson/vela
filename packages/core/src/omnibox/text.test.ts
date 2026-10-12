import { describe, expect, it } from 'vitest';
import {
  matchField,
  matchFields,
  mergeRanges,
  normalizeText,
  prefixEditDistance,
  prepareText,
  SCORE,
  tokenize,
} from './text';

describe('normalizeText / tokenize', () => {
  it('lowercases and strips diacritics', () => {
    expect(normalizeText('Café Été ÇA')).toBe('cafe ete ca');
    expect(tokenize('  Crème   brûlée ')).toEqual(['creme', 'brulee']);
  });
});

describe('prepareText', () => {
  it('maps normalized indices back to the raw text and finds word starts', () => {
    const p = prepareText('Le Café-Bar');
    expect(p.norm).toBe('le cafe-bar');
    expect(Array.from(p.words)).toEqual([0, 3, 8]);
    expect(p.map[5]).toBe(5);
  });

  it('keeps the mapping through decomposed characters', () => {
    const p = prepareText('éte');
    expect(p.norm).toBe('ete');
    expect(Array.from(p.map)).toEqual([0, 2, 3]);
  });
});

describe('prefixEditDistance', () => {
  it('counts substitutions, transpositions and partial words', () => {
    expect(prefixEditDistance('github', 'github', 1)).toBe(0);
    expect(prefixEditDistance('gihtub', 'github', 1)).toBe(1);
    expect(prefixEditDistance('githb', 'github', 1)).toBe(1);
    expect(prefixEditDistance('gitub', 'github', 1)).toBe(1);
    expect(prefixEditDistance('gothu', 'github', 1)).toBe(1);
    expect(prefixEditDistance('xyzab', 'github', 1)).toBe(2);
    expect(prefixEditDistance('abcdef', 'ab', 1)).toBe(2);
  });
});

describe('matchField', () => {
  const f = (s: string) => prepareText(s);

  it('ranks field prefix > word prefix > substring > typo', () => {
    const prefix = matchField(['git'], f('GitHub'))?.score;
    const word = matchField(['hub'], f('Git Hub'))?.score;
    const sub = matchField(['thu'], f('GitHub'))?.score;
    const typo = matchField(['gihtub'], f('GitHub'))?.score;
    expect(prefix).toBe(SCORE.fieldPrefix);
    expect(word).toBe(SCORE.wordPrefix);
    expect(sub).toBe(SCORE.substring);
    expect(typo).toBeCloseTo(SCORE.typo);
  });

  it('matches words in any order and ignores accents', () => {
    expect(matchField(['vela', 'github'], f('GitHub – velabrowser/vela'))).not.toBeNull();
    expect(matchField(['cafe'], f('Café de Flore'))?.score).toBe(1);
    expect(matchField(['creme'], f('La crème'))?.ranges).toEqual([[3, 8]]);
  });

  it('needs every token', () => {
    expect(matchField(['vela', 'gitlab'], f('GitHub vela'))).toBeNull();
    expect(matchField([], f('x'))).toBeNull();
  });

  it('matches initials for a single token', () => {
    const m = matchField(['hn'], f('Hacker News'));
    expect(m?.score).toBe(SCORE.acronym);
    expect(m?.ranges).toEqual([
      [0, 1],
      [7, 8],
    ]);
  });

  it('prefers the whole query as one phrase', () => {
    expect(matchField(['hacker', 'news'], f('Hacker News'))?.score).toBe(1);
  });

  it('does not typo-match short tokens', () => {
    expect(matchField(['gti'], f('GitHub'))).toBeNull();
  });

  it('allows two typos on long tokens', () => {
    expect(matchField(['wikipdiea'], f('Wikipedia'))).not.toBeNull();
  });
});

describe('matchFields', () => {
  it('splits tokens across fields when no single field has them all', () => {
    const title = prepareText('Pull requests');
    const url = prepareText('github.com/velabrowser/vela/pulls');
    const m = matchFields(['requests', 'velabrowser'], [title, url, null]);
    expect(m?.score).toBeCloseTo(0.9 * 0.95);
    expect(m?.perField[0]).toEqual([[5, 13]]);
    expect(m?.perField[1]).toEqual([[11, 22]]);
  });

  it('returns null when a token matches nowhere', () => {
    expect(matchFields(['zzz'], [prepareText('abc'), null])).toBeNull();
    expect(matchFields(['abc', 'zzz'], [prepareText('abc'), prepareText('def')])).toBeNull();
  });
});

describe('mergeRanges', () => {
  it('merges overlapping and touching ranges', () => {
    expect(
      mergeRanges([
        [5, 8],
        [0, 2],
        [2, 3],
        [7, 9],
      ]),
    ).toEqual([
      [0, 3],
      [5, 9],
    ]);
  });
});
