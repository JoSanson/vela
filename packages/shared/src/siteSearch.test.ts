import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SITE_SEARCHES,
  matchSiteSearch,
  siteHomeUrl,
  siteQueryOf,
  siteSearchProblem,
  siteSearchUrl,
  type SiteSearch,
} from './siteSearch';

const [youtube] = DEFAULT_SITE_SEARCHES as [SiteSearch, ...SiteSearch[]];

describe('site search', () => {
  it('matches keywords case-insensitively and only whole', () => {
    expect(matchSiteSearch('y', DEFAULT_SITE_SEARCHES)?.id).toBe('youtube');
    expect(matchSiteSearch(' GH ', DEFAULT_SITE_SEARCHES)?.id).toBe('github');
    expect(matchSiteSearch('yo', DEFAULT_SITE_SEARCHES)).toBeNull();
    expect(matchSiteSearch('', DEFAULT_SITE_SEARCHES)).toBeNull();
  });

  it('ships unique keywords and valid templates', () => {
    const keywords = DEFAULT_SITE_SEARCHES.map((s) => s.keyword);
    expect(new Set(keywords).size).toBe(keywords.length);
    for (const s of DEFAULT_SITE_SEARCHES) expect(siteSearchProblem(s, DEFAULT_SITE_SEARCHES)).toBeNull();
  });

  it('builds search and home URLs', () => {
    expect(siteSearchUrl(youtube, ' lo-fi beats ')).toBe(
      'https://www.youtube.com/results?search_query=lo-fi%20beats',
    );
    expect(siteHomeUrl(youtube)).toBe('https://www.youtube.com/');
  });

  it('recovers the query from a visited search URL', () => {
    expect(siteQueryOf(youtube, 'https://www.youtube.com/results?search_query=agent+n8n&sp=1')).toBe(
      'agent n8n',
    );
    expect(siteQueryOf(youtube, 'https://www.youtube.com/results?search_query=')).toBeNull();
    expect(siteQueryOf(youtube, 'https://www.youtube.com/watch?v=1')).toBeNull();
  });

  it('flags broken entries', () => {
    const custom = { ...youtube, id: 'c', keyword: 'y' };
    expect(siteSearchProblem(custom, [youtube, custom])).toBe('duplicate');
    expect(siteSearchProblem({ ...custom, keyword: 'two words' }, [custom])).toBe('keyword');
    expect(siteSearchProblem({ ...custom, keyword: 'k', url: 'https://x.com/' }, [custom])).toBe('url');
  });
});
