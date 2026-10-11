import type { SuggestionResult } from '@vela/shared';
import { net } from 'electron';

const cache = new Map<string, string[]>();
const MAX_CACHE = 200;

function remember(key: string, value: string[]): void {
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, value);
}

function parse(body: unknown): string[] {
  if (Array.isArray(body) && Array.isArray(body[1])) {
    return (body[1] as unknown[]).filter((x): x is string => typeof x === 'string');
  }
  return [];
}

/** `source` is the default engine, or a site search from the prefs (its own endpoint, if any). */
export async function fetchSuggestions(
  source: { id: string; suggestUrl: string | null } | undefined,
  query: string,
): Promise<SuggestionResult> {
  const q = query.trim();
  if (!source?.suggestUrl || !source.suggestUrl.startsWith('https://') || q.length < 2) {
    return { query, suggestions: [] };
  }
  const key = `${source.id}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return { query, suggestions: hit };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 900);
  try {
    const res = await net.fetch(source.suggestUrl.replace('%s', encodeURIComponent(q)), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { query, suggestions: [] };
    const suggestions = parse((await res.json()) as unknown).slice(0, 6);
    remember(key, suggestions);
    return { query, suggestions };
  } catch {
    return { query, suggestions: [] };
  } finally {
    clearTimeout(timer);
  }
}
