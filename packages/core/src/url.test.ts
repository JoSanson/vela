import { describe, expect, it } from 'vitest';
import { SEARCH_ENGINES, hostOf, isInternalUrl, originOf, prettyUrl, resolveInput, searchUrl } from './url';
import type { SearchEngine } from './url';

const google: SearchEngine = SEARCH_ENGINES[0] ?? {
  id: 'g',
  name: 'G',
  searchUrl: 'https://g/?q=%s',
  suggestUrl: null,
};

describe('resolveInput', () => {
  it('treats host-like inputs as URLs', () => {
    expect(resolveInput('localhost:3000', google)).toEqual({ url: 'http://localhost:3000', isSearch: false });
    expect(resolveInput('localhost', google)).toEqual({ url: 'http://localhost', isSearch: false });
    expect(resolveInput('127.0.0.1:8080/admin', google)).toEqual({
      url: 'http://127.0.0.1:8080/admin',
      isSearch: false,
    });
    expect(resolveInput('[::1]:5173', google)).toEqual({ url: 'http://[::1]:5173', isSearch: false });
    expect(resolveInput('192.168.1.1', google)).toEqual({ url: 'https://192.168.1.1', isSearch: false });
    expect(resolveInput('github.com/foo', google)).toEqual({
      url: 'https://github.com/foo',
      isSearch: false,
    });
    expect(resolveInput('example.com:8443/x?y=1', google)).toEqual({
      url: 'https://example.com:8443/x?y=1',
      isSearch: false,
    });
    expect(resolveInput('  Docs.Example.IO  ', google)).toEqual({
      url: 'https://Docs.Example.IO',
      isSearch: false,
    });
  });

  it('passes through explicit schemes and vela://', () => {
    expect(resolveInput('https://example.com/a b', google)).toEqual({
      url: 'https://example.com/a b',
      isSearch: false,
    });
    expect(resolveInput('HTTP://Example.com', google)).toEqual({
      url: 'HTTP://Example.com',
      isSearch: false,
    });
    expect(resolveInput('mailto:someone@example.com', google)).toEqual({
      url: 'mailto:someone@example.com',
      isSearch: false,
    });
    expect(resolveInput('about:blank', google)).toEqual({ url: 'about:blank', isSearch: false });
    expect(resolveInput('vela://history', google)).toEqual({ url: 'vela://history', isSearch: false });
  });

  it('turns dangerous schemes into searches', () => {
    for (const input of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<b>x</b>',
      'file:///etc/passwd',
    ]) {
      const r = resolveInput(input, google);
      expect(r.isSearch).toBe(true);
      expect(r.url).toBe(`https://www.google.com/search?q=${encodeURIComponent(input)}`);
    }
  });

  it('turns plain text into a search', () => {
    expect(resolveInput('what is love', google)).toEqual({
      url: 'https://www.google.com/search?q=what%20is%20love',
      isSearch: true,
    });
    expect(resolveInput('3.14', google).isSearch).toBe(true);
    expect(resolveInput('hello', google).isSearch).toBe(true);
    expect(resolveInput('github.com is down', google).isSearch).toBe(true);
    expect(resolveInput('c++ templates', google).url).toContain('c%2B%2B');
  });

  it('returns an empty url for blank input', () => {
    expect(resolveInput('   ', google)).toEqual({ url: '', isSearch: false });
  });

  it('works with every bundled engine', () => {
    for (const engine of SEARCH_ENGINES) {
      expect(searchUrl('a&b', engine)).toBe(engine.searchUrl.replace('%s', 'a%26b'));
      expect(resolveInput('a&b', engine).url).toBe(engine.searchUrl.replace('%s', 'a%26b'));
    }
  });
});

describe('hostOf / originOf / isInternalUrl', () => {
  it('extracts host without www and origin, empty on invalid', () => {
    expect(hostOf('https://www.example.com:8443/path')).toBe('example.com');
    expect(hostOf('http://localhost:3000/')).toBe('localhost');
    expect(hostOf('nope')).toBe('');
    expect(originOf('https://www.example.com:8443/path?q')).toBe('https://www.example.com:8443');
    expect(originOf('nope')).toBe('');
    expect(isInternalUrl('vela://settings')).toBe(true);
    expect(isInternalUrl('https://vela.dev')).toBe(false);
  });
});

describe('prettyUrl', () => {
  it('strips https scheme, www and trailing slash', () => {
    expect(prettyUrl('https://www.example.com/')).toBe('example.com');
    expect(prettyUrl('https://example.com/docs/')).toBe('example.com/docs/');
    expect(prettyUrl('https://example.com:8443/a?b=1#c')).toBe('example.com:8443/a?b=1#c');
  });

  it('keeps non-https schemes and ports', () => {
    expect(prettyUrl('http://localhost:3000/')).toBe('http://localhost:3000');
    expect(prettyUrl('http://www.example.com/x')).toBe('http://example.com/x');
    expect(prettyUrl('ftp://files.example.com/')).toBe('ftp://files.example.com');
  });

  it('passes through vela://, invalid and empty input', () => {
    expect(prettyUrl('vela://history')).toBe('vela://history');
    expect(prettyUrl('not a url')).toBe('not a url');
    expect(prettyUrl('')).toBe('');
  });
});
