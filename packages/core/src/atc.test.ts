import { describe, expect, it } from 'vitest';
import { atcPatternMatches, compileAtcPattern, matchAtc } from './atc';
import type { AtcRule } from './types';

describe('compileAtcPattern', () => {
  it('returns null for empty patterns', () => {
    expect(compileAtcPattern('')).toBeNull();
    expect(compileAtcPattern('   ')).toBeNull();
    expect(atcPatternMatches('', 'https://github.com/')).toBe(false);
  });

  it('compiles a case-insensitive regexp', () => {
    const re = compileAtcPattern('GitHub.com');
    expect(re).toBeInstanceOf(RegExp);
    expect(re?.flags).toContain('i');
  });
});

describe('atcPatternMatches', () => {
  it('bare host matches the host, its subdomains, ports and any path', () => {
    const p = 'github.com';
    expect(atcPatternMatches(p, 'https://github.com')).toBe(true);
    expect(atcPatternMatches(p, 'https://github.com/')).toBe(true);
    expect(atcPatternMatches(p, 'https://github.com/vela/vela/pulls?x=1')).toBe(true);
    expect(atcPatternMatches(p, 'https://api.github.com/repos')).toBe(true);
    expect(atcPatternMatches(p, 'https://a.b.github.com:8443/x')).toBe(true);
    expect(atcPatternMatches(p, 'http://GITHUB.COM/Upper')).toBe(true);
    expect(atcPatternMatches(p, 'https://notgithub.com/')).toBe(false);
    expect(atcPatternMatches(p, 'https://github.com.evil.com/')).toBe(false);
    expect(atcPatternMatches(p, 'https://example.com/github.com')).toBe(false);
  });

  it('wildcard host and path', () => {
    const p = '*.google.com/*';
    expect(atcPatternMatches(p, 'https://mail.google.com/mail/u/0')).toBe(true);
    expect(atcPatternMatches(p, 'https://docs.google.com/')).toBe(true);
    expect(atcPatternMatches(p, 'https://google.com/')).toBe(false);
    expect(atcPatternMatches(p, 'https://mail.google.com')).toBe(false);
  });

  it('path without trailing wildcard matches exactly (optional trailing slash)', () => {
    const p = 'notion.so/page';
    expect(atcPatternMatches(p, 'https://notion.so/page')).toBe(true);
    expect(atcPatternMatches(p, 'https://www.notion.so/page/')).toBe(true);
    expect(atcPatternMatches(p, 'https://notion.so/pages')).toBe(false);
    expect(atcPatternMatches(p, 'https://notion.so/page/sub')).toBe(false);
  });

  it('scheme-qualified patterns pin the scheme and the exact host', () => {
    expect(atcPatternMatches('https://app.x.io/foo*', 'https://app.x.io/foobar/baz')).toBe(true);
    expect(atcPatternMatches('https://app.x.io/foo*', 'http://app.x.io/foobar')).toBe(false);
    expect(atcPatternMatches('https://app.x.io/foo*', 'https://beta.app.x.io/foo')).toBe(false);
    expect(atcPatternMatches('https://x.io', 'https://x.io/anything?q=1')).toBe(true);
    expect(atcPatternMatches('https://x.io', 'https://x.io:8080/')).toBe(true);
    expect(atcPatternMatches('https://x.io', 'https://sub.x.io/')).toBe(false);
    expect(atcPatternMatches('https://mail.google.com/*', 'https://mail.google.com/mail/u/0')).toBe(true);
    expect(atcPatternMatches('https://mail.google.com/*', 'https://mail.google.com')).toBe(false);
  });

  it('escapes regexp metacharacters in patterns', () => {
    expect(atcPatternMatches('example.com/a+b?c=(1)', 'https://example.com/a+b?c=(1)')).toBe(true);
    expect(atcPatternMatches('example.com/a+b?c=(1)', 'https://example.com/aab')).toBe(false);
    expect(atcPatternMatches('ex.mple.com', 'https://exzmple.com/')).toBe(false);
  });
});

describe('matchAtc', () => {
  const rules: AtcRule[] = [
    { id: 'r0', pattern: 'github.com', spaceId: 'disabled', enabled: false },
    { id: 'r1', pattern: '', spaceId: 'invalid', enabled: true },
    { id: 'r2', pattern: '*.github.com/*', spaceId: 'work', enabled: true },
    { id: 'r3', pattern: 'github.com', spaceId: 'code', enabled: true },
    { id: 'r4', pattern: 'https://mail.google.com/*', spaceId: 'mail', enabled: true },
  ];

  it('first enabled match wins and disabled / invalid rules are skipped', () => {
    expect(matchAtc(rules, 'https://github.com/vela')).toBe('code');
    expect(matchAtc(rules, 'https://api.github.com/x')).toBe('work');
    expect(matchAtc(rules, 'https://mail.google.com/mail/u/0')).toBe('mail');
  });

  it('returns null when nothing matches', () => {
    expect(matchAtc(rules, 'https://example.com/')).toBeNull();
    expect(matchAtc([], 'https://github.com/')).toBeNull();
    expect(matchAtc(rules, 'vela://history')).toBeNull();
  });
});
