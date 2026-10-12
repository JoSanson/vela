import { describe, expect, it } from 'vitest';
import {
  adaptiveScores,
  displayUrl,
  frecency,
  inlineCompletion,
  rankHome,
  rankOmnibox,
  urlKey,
  type InputUse,
  type OmniCandidate,
} from './rank';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const search = { url: 'https://search.example/?q=x', isSearch: true };

function hist(url: string, title: string, visitCount: number, daysAgo = 1): OmniCandidate {
  return { id: `history:${url}`, kind: 'history', title, url, visitCount, lastVisit: NOW - daysAgo * DAY };
}
function tab(id: string, url: string, title: string, extra: Partial<OmniCandidate> = {}): OmniCandidate {
  return { id: `tab:${id}`, kind: 'tab', title, url, lastVisit: NOW - 60_000, ...extra };
}
function cmd(id: string, title: string, keywords?: string): OmniCandidate {
  return { id: `cmd:${id}`, kind: 'command', title, ...(keywords ? { keywords } : {}) };
}
const ids = (r: { rows: { id: string }[] }) => r.rows.map((x) => x.id);

describe('urlKey / displayUrl', () => {
  it('normalizes scheme, www, hash and trailing slash', () => {
    expect(urlKey('https://www.GitHub.com/a/#top')).toBe('github.com/a');
    expect(urlKey('http://example.com/')).toBe('example.com');
    expect(urlKey('cmd:Settings')).toBe('cmd:settings');
  });

  it('shows http(s) URLs without scheme, decoded', () => {
    expect(displayUrl('https://www.wikipedia.org/wiki/Caf%C3%A9/')).toBe('wikipedia.org/wiki/Café');
    expect(displayUrl('https://x.com/%E0%A4%A')).toBe('x.com/%E0%A4%A');
    expect(displayUrl('vela://settings')).toBe('vela://settings');
  });
});

describe('frecency', () => {
  it('grows with visits and fades with age', () => {
    expect(frecency(0, NOW, NOW)).toBe(0);
    expect(frecency(200, NOW - DAY, NOW)).toBeGreaterThan(frecency(1, NOW - DAY, NOW));
    expect(frecency(10, NOW - DAY, NOW)).toBeGreaterThan(frecency(10, NOW - 60 * DAY, NOW));
    expect(frecency(10, NOW - 10 * DAY, NOW)).toBeGreaterThan(frecency(10, NOW - 20 * DAY, NOW));
    expect(frecency(10, NOW - 200 * DAY, NOW)).toBeGreaterThan(0);
  });
});

describe('adaptiveScores', () => {
  const inputs: InputUse[] = [
    { input: 'github', url: 'https://github.com/', uses: 3, lastUsed: NOW - DAY },
    { input: 'gh', url: 'https://github.com/', uses: 1, lastUsed: NOW - DAY },
    { input: 'gmail', url: 'https://mail.google.com/', uses: 1, lastUsed: NOW - 400 * DAY },
  ];
  it('scores picks whose input starts with the query', () => {
    const s = adaptiveScores('gi', inputs, NOW);
    expect(s.get('github.com')).toBeGreaterThan(0.5);
    expect(s.has('mail.google.com')).toBe(false);
    expect(adaptiveScores('g', inputs, NOW).get('mail.google.com')).toBeLessThan(0.05);
    expect(adaptiveScores('', inputs, NOW).size).toBe(0);
  });
});

describe('rankOmnibox', () => {
  it('learns: what was picked for "gh" becomes the default for "gh"', () => {
    const candidates = [hist('https://github.com/', 'GitHub', 3), hist('https://ghost.org/', 'Ghost', 1)];
    const before = rankOmnibox({ query: 'gh', now: NOW, candidates, typed: search });
    expect(before.rows[0]?.kind).not.toBe('history');
    const after = rankOmnibox({
      query: 'gh',
      now: NOW,
      candidates,
      typed: search,
      inputs: [{ input: 'gh', url: 'https://github.com/', uses: 1, lastUsed: NOW - DAY }],
    });
    expect(after.rows[0]?.id).toBe('history:https://github.com/');
  });

  it('puts the site visited 200 times above a page seen once', () => {
    const r = rankOmnibox({
      query: 'git',
      now: NOW,
      candidates: [
        hist('https://example.com/git-tutorial', 'Git tutorial', 1),
        hist('https://github.com/', 'GitHub', 200),
      ],
      typed: search,
    });
    expect(r.completion).toEqual({ text: 'github.com', url: 'https://github.com/' });
    expect(r.rows[0]?.id).toBe('history:https://github.com/');
    expect(ids(r).indexOf('history:https://example.com/git-tutorial')).toBeGreaterThan(0);
  });

  it('matches words in any order, across title and URL', () => {
    const r = rankOmnibox({
      query: 'vela pulls',
      now: NOW,
      candidates: [hist('https://github.com/velabrowser/vela/pulls', 'Pull requests', 4)],
      typed: search,
    });
    expect(ids(r)).toContain('history:https://github.com/velabrowser/vela/pulls');
  });

  it('forgives typos and accents', () => {
    const candidates = [
      hist('https://github.com/', 'GitHub', 20),
      hist('https://cafe.fr/', 'Café de Flore', 2),
    ];
    expect(ids(rankOmnibox({ query: 'gihtub', now: NOW, candidates, typed: search }))).toContain(
      'history:https://github.com/',
    );
    const r = rankOmnibox({ query: 'cafe flore', now: NOW, candidates, typed: search });
    expect(r.rows.find((x) => x.id === 'history:https://cafe.fr/')?.titleRanges).toEqual([
      [0, 4],
      [8, 13],
    ]);
  });

  it('merges an open tab with its history row into one "switch to tab"', () => {
    const r = rankOmnibox({
      query: 'linear',
      now: NOW,
      candidates: [
        hist('https://linear.app/', 'Linear', 50),
        tab('t1', 'https://linear.app/', 'Linear – Inbox'),
      ],
      typed: search,
    });
    expect(ids(r).filter((id) => id.startsWith('tab:') || id.startsWith('history:'))).toEqual(['tab:t1']);
    expect(r.rows[0]?.id).toBe('tab:t1');
  });

  it('never makes the current tab the default', () => {
    const r = rankOmnibox({
      query: 'notion',
      now: NOW,
      candidates: [tab('t1', 'https://notion.so/', 'Notion – Workspace', { current: true })],
      typed: search,
    });
    // Completing to the page already on screen opens it fresh rather than "switching" to itself.
    expect(r.rows[0]?.id).toBe('url:https://notion.so/');
    const listed = rankOmnibox({
      query: 'workspace',
      now: NOW,
      candidates: [tab('t1', 'https://notion.so/', 'Notion – Workspace', { current: true })],
      typed: search,
    });
    expect(listed.rows[0]?.kind).toBe('search');
    expect(ids(listed)).toContain('tab:t1');
  });

  it('keeps search as default for a sentence that only loosely matches history', () => {
    const r = rankOmnibox({
      query: 'how to bake bread',
      now: NOW,
      candidates: [hist('https://blog.example/how-to', 'How to train your dragon', 1)],
      typed: search,
      suggestions: ['how to bake bread at home', 'How to bake bread'],
    });
    expect(r.rows[0]).toMatchObject({ kind: 'search', group: 'top' });
    expect(r.rows.filter((x) => x.kind === 'suggestion').map((x) => x.title)).toEqual([
      'how to bake bread at home',
    ]);
  });

  it('opens a typed URL, or switches to it when it is already open', () => {
    const typed = { url: 'https://example.com', isSearch: false };
    const r = rankOmnibox({ query: 'example.com', now: NOW, candidates: [], typed });
    expect(r.rows[0]).toMatchObject({ id: 'url:https://example.com', group: 'top' });
    expect(r.rows.some((x) => x.kind === 'search')).toBe(true);
    const open = rankOmnibox({
      query: 'example.com',
      now: NOW,
      candidates: [tab('t9', 'https://example.com/', 'Example')],
      typed,
    });
    expect(open.rows[0]?.id).toBe('tab:t9');
  });

  it('lets a command lead on a clear prefix, in any language', () => {
    const candidates = [
      cmd('settings', 'Réglages', 'Settings preferences'),
      hist('https://setlist.fm/', 'Setlist', 1),
    ];
    expect(rankOmnibox({ query: 'settings', now: NOW, candidates, typed: search }).rows[0]?.id).toBe(
      'cmd:settings',
    );
    expect(rankOmnibox({ query: 'régla', now: NOW, candidates, typed: search }).rows[0]?.id).toBe(
      'cmd:settings',
    );
    expect(rankOmnibox({ query: 'se', now: NOW, candidates, typed: search }).rows[0]?.kind).toBe('search');
  });

  it('never defaults to a destructive command, and to a Space only by its exact name', () => {
    const candidates: OmniCandidate[] = [
      { ...cmd('clearToday', 'Clear unpinned tabs'), noDefault: true },
      { id: 'space:w', kind: 'space', title: 'Work' },
    ];
    expect(rankOmnibox({ query: 'clear unpinned', now: NOW, candidates, typed: search }).rows[0]?.kind).toBe(
      'search',
    );
    expect(rankOmnibox({ query: 'wor', now: NOW, candidates, typed: search }).rows[0]?.kind).toBe('search');
    expect(rankOmnibox({ query: 'work', now: NOW, candidates, typed: search }).rows[0]?.id).toBe('space:w');
  });

  it('learns commands too', () => {
    const r = rankOmnibox({
      query: 'dl',
      now: NOW,
      candidates: [cmd('downloads', 'Downloads')],
      typed: search,
      inputs: [{ input: 'dl', url: 'cmd:downloads', uses: 2, lastUsed: NOW }],
    });
    expect(r.rows[0]?.id).toBe('cmd:downloads');
  });

  it('shows an instant answer first', () => {
    const r = rankOmnibox({ query: '12*12', now: NOW, candidates: [], typed: search });
    expect(r.rows[0]).toMatchObject({ kind: 'answer', answer: { kind: 'calc', value: 144 } });
    expect(r.rows[1]).toMatchObject({ kind: 'search', group: 'top' });
  });

  it('">" lists commands only, "?" searches only', () => {
    const candidates = [
      cmd('history', 'History'),
      cmd('downloads', 'Downloads'),
      hist('https://h.com/', 'History of Rome', 9),
    ];
    expect(ids(rankOmnibox({ query: '>', now: NOW, candidates }))).toEqual(['cmd:history', 'cmd:downloads']);
    expect(ids(rankOmnibox({ query: '> hist', now: NOW, candidates }))).toEqual(['cmd:history']);
    const s = rankOmnibox({ query: '?github.com', now: NOW, candidates, suggestions: ['github.com login'] });
    expect(ids(s)).toEqual(['search:github.com', 'suggestion:github.com login']);
    expect(s.completion).toBeNull();
    expect(rankOmnibox({ query: '?', now: NOW, candidates }).rows).toEqual([]);
  });

  it('is empty for an empty query', () => {
    expect(rankOmnibox({ query: '  ', now: NOW, candidates: [cmd('a', 'A')] }).rows).toEqual([]);
  });

  it('caps navigation rows', () => {
    const many = Array.from({ length: 30 }, (_, i) => hist(`https://docs${i}.dev/`, `Docs ${i}`, i + 1));
    const r = rankOmnibox({ query: 'docs', now: NOW, candidates: many, typed: search, maxNav: 5 });
    expect(r.rows.filter((x) => x.group === 'nav')).toHaveLength(5);
  });

  // The bar never ranks more than ~1 000 candidates (150 frecent + 80 full-text + tabs + commands).
  it('ranks 2 000 candidates in under 30 ms, typo in a two-word query included', () => {
    const many = Array.from({ length: 2_000 }, (_, i) =>
      hist(`https://site${i}.example.com/path/${i}`, `Page number ${i} about things`, (i % 50) + 1, i % 100),
    );
    rankOmnibox({ query: 'warm', now: NOW, candidates: many, typed: search });
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      const r = rankOmnibox({ query: 'page thnigs', now: NOW, candidates: many, typed: search });
      best = Math.min(best, performance.now() - t0);
      expect(r.rows.some((x) => x.kind === 'history')).toBe(true);
    }
    expect(best).toBeLessThan(30);
  });
});

describe('inlineCompletion', () => {
  const none = new Map<string, number>();
  const cands = [
    hist('https://github.com/velabrowser/vela', 'Vela', 30),
    hist('https://github.com/', 'GitHub', 10),
    hist('https://gitlab.com/', 'GitLab', 4, 2),
    hist('http://localhost:3000/', 'Dev', 5),
  ];

  it('completes to the host the user visits most', () => {
    expect(inlineCompletion('gi', cands, none, NOW)).toEqual({
      text: 'github.com',
      url: 'https://github.com/',
    });
    expect(inlineCompletion('GitL', cands, none, NOW)).toEqual({
      text: 'GitLab.com',
      url: 'https://gitlab.com/',
    });
    expect(inlineCompletion('www.gith', cands, none, NOW)?.text).toBe('www.github.com');
    expect(inlineCompletion('local', cands, none, NOW)?.url).toBe('http://localhost:3000/');
  });

  it('completes a path once one is typed', () => {
    expect(inlineCompletion('github.com/ve', cands, none, NOW)).toEqual({
      text: 'github.com/velabrowser/vela',
      url: 'https://github.com/velabrowser/vela',
    });
  });

  it('builds the origin when only deep pages of a host are known', () => {
    expect(inlineCompletion('ex', [hist('https://example.org/a/b', 'A', 9)], none, NOW)).toEqual({
      text: 'example.org',
      url: 'https://example.org/',
    });
  });

  it('stays quiet when there is nothing sensible to add', () => {
    expect(inlineCompletion('g', cands, none, NOW)).toBeNull();
    expect(inlineCompletion('github.com', cands, none, NOW)).toBeNull();
    expect(inlineCompletion('git hub', cands, none, NOW)).toBeNull();
    expect(inlineCompletion('https://gi', cands, none, NOW)).toBeNull();
    expect(inlineCompletion('zzz', cands, none, NOW)).toBeNull();
    expect(inlineCompletion('', cands, none, NOW)).toBeNull();
  });

  it('completes from one letter once the user has picked that site for it', () => {
    expect(inlineCompletion('g', cands, new Map([['github.com', 0.6]]), NOW)?.text).toBe('github.com');
  });
});

describe('rankHome', () => {
  it('lists recent tabs, frequent sites not already open, then recently closed', () => {
    const rows = rankHome(
      [
        tab('a', 'https://a.com/', 'A', { lastVisit: NOW - 10 }),
        tab('b', 'https://b.com/', 'B', { lastVisit: NOW - 5 }),
        tab('cur', 'https://cur.com/', 'Cur', { current: true }),
        hist('https://a.com/', 'A', 99),
        hist('https://mail.com/inbox', 'Inbox', 80),
        hist('https://mail.com/sent', 'Sent', 70),
        hist('https://news.com/', 'News', 20),
        { id: 'closed:1', kind: 'closed', title: 'Closed', url: 'https://closed.com/' },
        { id: 'closed:2', kind: 'closed', title: 'Closed A', url: 'https://a.com/' },
      ],
      NOW,
    );
    expect(rows.map((r) => `${r.group}:${r.id}`)).toEqual([
      'tabs:tab:b',
      'tabs:tab:a',
      'frequent:history:https://mail.com/inbox',
      'frequent:history:https://news.com/',
      'closed:closed:1',
    ]);
  });
});
