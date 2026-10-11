import { describe, expect, it } from 'vitest';
import { createTranslator, formatMessage, resolveLocale } from './index';
import { en } from './en';
import { fr } from './fr';

describe('resolveLocale', () => {
  it('prefers the explicit pref, else maps the OS language, else English', () => {
    expect(resolveLocale('fr', 'en-US')).toBe('fr');
    expect(resolveLocale('system', 'fr-CA')).toBe('fr');
    expect(resolveLocale('system', 'fr_FR')).toBe('fr');
    expect(resolveLocale('system', 'de-DE')).toBe('en');
    expect(resolveLocale(undefined, '')).toBe('en');
  });
});

describe('formatMessage', () => {
  it('interpolates and pluralises', () => {
    expect(formatMessage('en', 'Hello {name}', { name: 'Ada' })).toBe('Hello Ada');
    expect(formatMessage('en', '{n, plural, one {# tab} other {# tabs}}', { n: 1 })).toBe('1 tab');
    expect(formatMessage('en', '{n, plural, one {# tab} other {# tabs}}', { n: 3 })).toBe('3 tabs');
    expect(formatMessage('fr', '{n, plural, one {# onglet} other {# onglets}}', { n: 0 })).toBe('0 onglet');
    expect(formatMessage('en', '{n, plural, =0 {none} one {# tab} other {# tabs}}', { n: 0 })).toBe('none');
    expect(
      formatMessage('en', 'Close {n, plural, one {# tab} other {# tabs}} in {space}', {
        n: 2,
        space: 'Work',
      }),
    ).toBe('Close 2 tabs in Work');
    expect(formatMessage('en', 'Literal {missing}', {})).toBe('Literal {missing}');
  });
});

describe('dictionaries', () => {
  it('French covers every English key with no empty strings', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(fr[key], key).toBeTypeOf('string');
      expect(fr[key].length, key).toBeGreaterThan(0);
    }
  });
  it('translators are cached per locale and fall back to English', () => {
    const t = createTranslator('fr');
    expect(t).toBe(createTranslator('fr'));
    expect(t('common.cancel')).toBe('Annuler');
    expect(t('common.tabs.count', { n: 2 })).toBe('2 onglets');
    expect(t.locale).toBe('fr');
  });
});
