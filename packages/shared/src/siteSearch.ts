/** A site reachable from the command bar by typing its keyword then Tab (`y` ⇥ YouTube). */
export interface SiteSearch {
  id: string;
  keyword: string;
  name: string;
  /** Search URL with `%s` where the query goes. */
  url: string;
  /** Brand colour for the pill and the selected row. */
  color: string;
  /** Firefox-style suggestion endpoint (`[query, [suggestions]]`), or null. */
  suggestUrl: string | null;
}

export const DEFAULT_SITE_SEARCHES: readonly SiteSearch[] = [
  {
    id: 'youtube',
    keyword: 'y',
    name: 'YouTube',
    url: 'https://www.youtube.com/results?search_query=%s',
    color: '#ff0033',
    suggestUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=%s',
  },
  {
    id: 'perplexity',
    keyword: 'p',
    name: 'Perplexity',
    url: 'https://www.perplexity.ai/search?q=%s',
    color: '#20808d',
    suggestUrl: null,
  },
  {
    id: 'google',
    keyword: 'g',
    name: 'Google',
    url: 'https://www.google.com/search?q=%s',
    color: '#4285f4',
    suggestUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&q=%s',
  },
  {
    id: 'chatgpt',
    keyword: 'c',
    name: 'ChatGPT',
    url: 'https://chatgpt.com/?q=%s',
    color: '#10a37f',
    suggestUrl: null,
  },
  {
    id: 'wikipedia',
    keyword: 'w',
    name: 'Wikipedia',
    url: 'https://en.wikipedia.org/w/index.php?search=%s',
    color: '#636466',
    suggestUrl: 'https://en.wikipedia.org/w/api.php?action=opensearch&limit=6&format=json&search=%s',
  },
  {
    id: 'github',
    keyword: 'gh',
    name: 'GitHub',
    url: 'https://github.com/search?q=%s',
    color: '#24292f',
    suggestUrl: null,
  },
  {
    id: 'reddit',
    keyword: 'r',
    name: 'Reddit',
    url: 'https://www.reddit.com/search/?q=%s',
    color: '#ff4500',
    suggestUrl: null,
  },
  {
    id: 'amazon',
    keyword: 'a',
    name: 'Amazon',
    url: 'https://www.amazon.com/s?k=%s',
    color: '#ff9900',
    suggestUrl: null,
  },
  { id: 'x', keyword: 'x', name: 'X', url: 'https://x.com/search?q=%s', color: '#0f1419', suggestUrl: null },
  {
    id: 'maps',
    keyword: 'm',
    name: 'Google Maps',
    url: 'https://www.google.com/maps/search/%s',
    color: '#34a853',
    suggestUrl: null,
  },
];

export function matchSiteSearch(input: string, sites: readonly SiteSearch[]): SiteSearch | null {
  const keyword = input.trim().toLowerCase();
  if (!keyword) return null;
  return sites.find((s) => s.keyword.toLowerCase() === keyword) ?? null;
}

export function siteSearchUrl(site: SiteSearch, query: string): string {
  return site.url.replace('%s', encodeURIComponent(query.trim()));
}

/** The part of the search URL before `%s`: what every search on the site starts with. */
export function siteSearchBase(site: SiteSearch): string {
  return site.url.split('%s')[0] ?? site.url;
}

export function siteHomeUrl(site: SiteSearch): string {
  try {
    return `${new URL(siteSearchBase(site)).origin}/`;
  } catch {
    return siteSearchBase(site);
  }
}

/** The query behind a visited URL when it was a search on the site, so history can offer it again. */
export function siteQueryOf(site: SiteSearch, url: string): string | null {
  const base = siteSearchBase(site);
  if (!base || !url.startsWith(base) || url.length === base.length) return null;
  const raw = url.slice(base.length).split(/[&#]/)[0] ?? '';
  try {
    const query = decodeURIComponent(raw.replace(/\+/g, ' ')).trim();
    return query || null;
  } catch {
    return null;
  }
}

export function siteSearchProblem(
  site: SiteSearch,
  all: readonly SiteSearch[],
): 'keyword' | 'duplicate' | 'url' | null {
  const keyword = site.keyword.trim().toLowerCase();
  if (!keyword || /\s/.test(keyword)) return 'keyword';
  if (all.some((s) => s.id !== site.id && s.keyword.trim().toLowerCase() === keyword)) return 'duplicate';
  if (!/^https?:\/\/.+%s/.test(site.url)) return 'url';
  return null;
}
