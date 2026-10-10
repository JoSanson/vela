import { describe, expect, it } from 'vitest';
import { fuzzyScore, makeSearchItem, rankItems } from './search';
import type { SearchItem, SearchItemKind } from './search';

function item(id: string, title: string, kind: SearchItemKind = 'tab', boost = 0, subtitle = ''): SearchItem {
  return makeSearchItem({ id, kind, title, subtitle, boost });
}

describe('makeSearchItem', () => {
  it('builds a lowercased key from title and subtitle unless provided', () => {
    expect(
      makeSearchItem({ id: '1', kind: 'tab', title: 'GitHub', subtitle: 'Pull Requests', boost: 0 }).key,
    ).toBe('github pull requests');
    expect(
      makeSearchItem({ id: '1', kind: 'tab', title: 'A', subtitle: 'B', boost: 0, key: 'custom' }).key,
    ).toBe('custom');
  });
});

describe('fuzzyScore', () => {
  it('ranks prefix > word boundary > inner substring > subsequence > none', () => {
    const prefix = fuzzyScore('git', 'github issues');
    const word = fuzzyScore('git', 'my github');
    const slash = fuzzyScore('git', 'example.com/git');
    const inner = fuzzyScore('git', 'digit');
    const sub = fuzzyScore('git', 'g i t');
    const none = fuzzyScore('git', 'xyz');
    expect(prefix).toBe(1);
    expect(word).toBe(0.9);
    expect(slash).toBe(0.9);
    expect(inner).toBe(0.75);
    expect(sub).toBeGreaterThan(0);
    expect(sub).toBeLessThanOrEqual(0.6);
    expect(none).toBe(0);
    expect(prefix > word && word > inner && inner > sub && sub > none).toBe(true);
  });

  it('returns 0 for an empty query or a partial subsequence', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
    expect(fuzzyScore('abc', 'a b')).toBe(0);
  });

  it('rewards consecutive and word-start subsequence matches and penalises long keys', () => {
    const tight = fuzzyScore('abc', 'xab yc');
    const loose = fuzzyScore('abc', 'xa_b_zc');
    const scattered = fuzzyScore('abc', 'xaxxbxxcx');
    expect(tight).toBeGreaterThan(loose);
    expect(loose).toBeGreaterThan(scattered);
    const short = fuzzyScore('abc', 'xa yb zc');
    const long = fuzzyScore('abc', `xa yb zc${' filler'.repeat(20)}`);
    expect(long).toBeLessThan(short);
  });
});

describe('rankItems', () => {
  const items: SearchItem[] = [
    item('t-git', 'GitHub', 'tab'),
    item('t-mygit', 'My GitHub', 'tab'),
    item('t-digit', 'Digit', 'tab'),
    item('t-sub', 'G i t', 'tab'),
    item('h-git', 'GitHub', 'history'),
    item('c-git', 'GitHub: open', 'command'),
    item('f-git', 'GitHub', 'favorite', 0.1),
    item('t-none', 'Nothing here', 'tab'),
    item('a-none', 'Archived', 'archived', 1),
  ];

  it('orders by match quality then kind weight, excludes non-matches', () => {
    const ranked = rankItems('git', items);
    expect(ranked.map((r) => r.item.id)).toEqual([
      't-git',
      'c-git',
      'f-git',
      't-mygit',
      't-digit',
      'h-git',
      't-sub',
    ]);
    expect(ranked.map((r) => r.score.toFixed(3))).toEqual([
      '1.000',
      '0.950',
      '0.915',
      '0.900',
      '0.750',
      '0.650',
      '0.450',
    ]);
  });

  it('boost nudges ties', () => {
    const a = item('a', 'GitHub', 'tab', 0);
    const b = item('b', 'GitHub', 'tab', 1);
    expect(rankItems('git', [a, b]).map((r) => r.item.id)).toEqual(['b', 'a']);
    expect(rankItems('git', [b, a]).map((r) => r.item.id)).toEqual(['b', 'a']);
  });

  it('trims and lowercases the query', () => {
    expect(rankItems('  GIT ', items)[0]?.item.id).toBe('t-git');
  });

  it('with an empty query lists only tabs, commands and favorites by weight + boost', () => {
    const ranked = rankItems('', items);
    expect(ranked.map((r) => r.item.id).sort()).toEqual([
      'c-git',
      'f-git',
      't-digit',
      't-git',
      't-mygit',
      't-none',
      't-sub',
    ]);
    expect(ranked.every((r, i) => i === 0 || (ranked[i - 1]?.score ?? 0) >= r.score)).toBe(true);
    const plain = rankItems('', [
      item('f', 'f', 'favorite'),
      item('c', 'c', 'command'),
      item('t', 't', 'tab'),
    ]);
    expect(plain.map((r) => `${r.item.id}:${r.score}`)).toEqual(['t:1', 'c:0.95', 'f:0.9']);
    const boosted = rankItems('   ', [item('x', 'x', 'favorite', 0.5), item('y', 'y', 'tab', 0)]);
    expect(boosted.map((r) => r.item.id)).toEqual(['x', 'y']);
  });

  it('honours the limit', () => {
    expect(rankItems('git', items, 2).map((r) => r.item.id)).toEqual(['t-git', 'c-git']);
    expect(rankItems('', items, 3)).toHaveLength(3);
    expect(rankItems('git', items, 100)).toHaveLength(7);
  });

  it('ranks 10 000 items for a 3-char query in under 30 ms (best of 3)', () => {
    const kinds: SearchItemKind[] = ['tab', 'history', 'archived', 'favorite', 'command', 'suggestion'];
    const words = [
      'docs',
      'github',
      'vela',
      'design',
      'electron',
      'react',
      'sqlite',
      'notion',
      'figma',
      'mail',
    ];
    const big: SearchItem[] = Array.from({ length: 10_000 }, (_, i) =>
      makeSearchItem({
        id: `i${i}`,
        kind: kinds[i % kinds.length] ?? 'tab',
        title: `${words[i % words.length] ?? ''} ${words[(i * 7) % words.length] ?? ''} page ${i}`,
        subtitle: `https://${words[(i * 3) % words.length] ?? 'x'}.example.com/path/${i}`,
        boost: (i % 10) / 10,
      }),
    );
    let best = Number.POSITIVE_INFINITY;
    let count = 0;
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now();
      count = rankItems('doc', big).length;
      best = Math.min(best, performance.now() - t0);
    }
    expect(count).toBe(20);
    expect(best).toBeLessThan(30);
  });
});
