import type { AtcRule, Id } from './types';

function escapeRe(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pattern grammar (user-friendly):
 *  - `github.com`            → any URL whose host is github.com or a subdomain
 *  - `*.google.com/*`        → wildcard host + path
 *  - `https://app.x.io/foo*` → full URL glob
 * `*` matches any run of characters; matching is case-insensitive.
 */
const MAX_WILDCARDS = 8;

export function compileAtcPattern(pattern: string): RegExp | null {
  // Runs of `*` collapse and their count is capped: `.*` chains backtrack on every openUrl().
  const p = pattern.trim().toLowerCase().replace(/\*+/g, '*');
  if (!p || (p.match(/\*/g)?.length ?? 0) > MAX_WILDCARDS) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(p);
  const hasPath =
    p.includes('/') && !hasScheme ? true : hasScheme && p.replace(/^[a-z]+:\/\//, '').includes('/');
  let source = escapeRe(p).replace(/\*/g, '.*');
  if (!hasScheme) source = `^[a-z]+://(?:[^/]*\\.)?${source}`;
  else source = `^${source}`;
  if (!hasPath) source += '(?:[:/].*)?$';
  else if (!p.endsWith('*')) source += '/?$';
  try {
    return new RegExp(source, 'i');
  } catch {
    return null;
  }
}

export function atcPatternMatches(pattern: string, url: string): boolean {
  const re = compileAtcPattern(pattern);
  return re ? re.test(url.toLowerCase()) : false;
}

/** Returns the space id the URL should open in, or null if no rule matches. First enabled match wins. */
export function matchAtc(rules: readonly AtcRule[], url: string): Id | null {
  for (const r of rules) {
    if (!r.enabled) continue;
    if (atcPatternMatches(r.pattern, url)) return r.spaceId;
  }
  return null;
}
