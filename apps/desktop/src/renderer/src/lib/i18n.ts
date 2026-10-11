import {
  createTranslator,
  resolveLocale,
  type LanguagePref,
  type Locale,
  type Translator,
} from '@vela/shared';
import { useSyncExternalStore } from 'react';

/**
 * One locale per renderer, derived from prefs + the OS language and pushed by the store that owns the
 * snapshot. `useT()` re-renders on change; `t()` is for code outside React (menus, formatters).
 */
let current: Translator = createTranslator('en');
const listeners = new Set<() => void>();

export function setUiLocale(pref: LanguagePref | undefined, systemLocale: string): void {
  const locale = resolveLocale(pref, systemLocale);
  if (locale === current.locale) return;
  current = createTranslator(locale);
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useT(): Translator {
  return useSyncExternalStore(subscribe, () => current);
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, () => current.locale);
}

export const t: Translator = ((key, params) => current(key, params)) as Translator;
Object.defineProperty(t, 'locale', { get: () => current.locale });
