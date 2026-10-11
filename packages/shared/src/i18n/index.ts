import { en } from './en';
import { fr } from './fr';

export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];
export type LanguagePref = 'system' | Locale;
export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
export type Params = Record<string, string | number>;
export type Translator = ((key: MessageKey, params?: Params) => string) & {
  locale: Locale;
  has: (key: string) => key is MessageKey;
};

export const LANGUAGE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français' };

const MESSAGES: Record<Locale, Messages> = { en, fr };

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/** `pref` wins; 'system' maps the OS language ("fr-CA", "fr_FR") onto a supported locale, else English. */
export function resolveLocale(pref: LanguagePref | undefined, systemLocale: string): Locale {
  if (pref && pref !== 'system' && isLocale(pref)) return pref;
  const lang = systemLocale.toLowerCase().split(/[-_]/)[0] ?? '';
  return isLocale(lang) ? lang : 'en';
}

const PLURAL_RULES = new Map<Locale, Intl.PluralRules>();

/**
 * Minimal ICU: `{name}` interpolation and `{n, plural, one {# item} other {# items}}` (also `=0 {…}`).
 * Enough for a browser shell, zero dependencies, and the messages stay readable for translators.
 */
export function formatMessage(locale: Locale, template: string, params: Params = {}): string {
  let out = '';
  let i = 0;
  while (i < template.length) {
    const open = template.indexOf('{', i);
    if (open === -1) {
      out += template.slice(i);
      break;
    }
    out += template.slice(i, open);
    const close = matchingBrace(template, open);
    const body = template.slice(open + 1, close);
    const comma = body.indexOf(',');
    if (comma === -1) {
      const v = params[body.trim()];
      out += v === undefined ? `{${body}}` : String(v);
    } else {
      const name = body.slice(0, comma).trim();
      const rest = body.slice(comma + 1).trim();
      const n = Number(params[name] ?? 0);
      if (rest.startsWith('plural,')) out += pluralBranch(locale, rest.slice('plural,'.length), n, params);
      else out += String(params[name] ?? '');
    }
    i = close + 1;
  }
  return out;
}

function matchingBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) return i;
  }
  return s.length;
}

function pluralBranch(locale: Locale, spec: string, n: number, params: Params): string {
  const branches = new Map<string, string>();
  let i = 0;
  while (i < spec.length) {
    const m = /^\s*(=\d+|zero|one|two|few|many|other)\s*\{/.exec(spec.slice(i));
    if (!m) break;
    const start = i + m[0].length - 1;
    const end = matchingBrace(spec, start);
    branches.set(m[1] ?? 'other', spec.slice(start + 1, end));
    i = end + 1;
  }
  let rules = PLURAL_RULES.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    PLURAL_RULES.set(locale, rules);
  }
  const chosen = branches.get(`=${n}`) ?? branches.get(rules.select(n)) ?? branches.get('other') ?? '';
  return formatMessage(locale, chosen.replace(/#/g, String(n)), params);
}

const CACHE = new Map<Locale, Translator>();

export function createTranslator(locale: Locale): Translator {
  const cached = CACHE.get(locale);
  if (cached) return cached;
  const messages = MESSAGES[locale];
  const t = ((key: MessageKey, params?: Params): string => {
    const template = messages[key] ?? en[key] ?? key;
    return params ? formatMessage(locale, template, params) : template;
  }) as Translator;
  t.locale = locale;
  t.has = (key: string): key is MessageKey => key in en;
  CACHE.set(locale, t);
  return t;
}

/** Localized label of a shortcut definition (`shortcut.<id>`, `shortcut.space` for Ctrl+1…9). */
export function shortcutLabel(t: Translator, def: { id: string; label: string }): string {
  const m = /^(space|tab|split)(\d)$/.exec(def.id);
  if (m) return t(`shortcut.${m[1] ?? 'space'}` as 'shortcut.space', { n: m[2] ?? '' });
  const key = `shortcut.${def.id}`;
  return t.has(key) ? t(key) : def.label;
}
