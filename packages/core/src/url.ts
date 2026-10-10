export interface SearchEngine {
  id: string;
  name: string;
  searchUrl: string;
  suggestUrl: string | null;
}

export const SEARCH_ENGINES: readonly SearchEngine[] = [
  {
    id: 'google',
    name: 'Google',
    searchUrl: 'https://www.google.com/search?q=%s',
    suggestUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&q=%s',
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    searchUrl: 'https://duckduckgo.com/?q=%s',
    suggestUrl: 'https://duckduckgo.com/ac/?type=list&q=%s',
  },
  { id: 'bing', name: 'Bing', searchUrl: 'https://www.bing.com/search?q=%s', suggestUrl: null },
  { id: 'brave', name: 'Brave Search', searchUrl: 'https://search.brave.com/search?q=%s', suggestUrl: null },
  { id: 'kagi', name: 'Kagi', searchUrl: 'https://kagi.com/search?q=%s', suggestUrl: null },
];

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const LOCALHOST_RE = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/.*)?$/i;
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/;
const HOST_RE = /^([a-z0-9-]+\.)+[a-z]{2,63}(:\d+)?(\/.*)?$/i;

/** Decides whether the omnibox input is a URL or a search query, and returns a navigable URL. */
export function resolveInput(raw: string, engine: SearchEngine): { url: string; isSearch: boolean } {
  const input = raw.trim();
  if (!input) return { url: '', isSearch: false };
  if (input.startsWith('vela://')) return { url: input, isSearch: false };
  if (SCHEME_RE.test(input)) {
    if (/^(javascript|data|file):/i.test(input)) return { url: searchUrl(input, engine), isSearch: true };
    return { url: input, isSearch: false };
  }
  if (!/\s/.test(input) && (LOCALHOST_RE.test(input) || IP_RE.test(input) || HOST_RE.test(input))) {
    return { url: `http${LOCALHOST_RE.test(input) ? '' : 's'}://${input}`, isSearch: false };
  }
  return { url: searchUrl(input, engine), isSearch: true };
}

export function searchUrl(query: string, engine: SearchEngine): string {
  return engine.searchUrl.replace('%s', encodeURIComponent(query));
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/** Short, readable form for the URL bar: strips scheme for https and trailing slash. */
export function prettyUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('vela://')) return url;
  try {
    const u = new URL(url);
    const host = u.host.replace(/^www\./, '');
    const rest = `${u.pathname}${u.search}${u.hash}`;
    const path = rest === '/' ? '' : rest;
    return u.protocol === 'https:' ? `${host}${path}` : `${u.protocol}//${host}${path}`;
  } catch {
    return url;
  }
}

export function isInternalUrl(url: string): boolean {
  return url.startsWith('vela://');
}
