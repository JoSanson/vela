import { describe, expect, it } from 'vitest';
import { permissionWarnings } from './extensionPermissions';

describe('permissionWarnings', () => {
  it('says nothing for an extension that asks for nothing sensitive', () => {
    expect(permissionWarnings({ permissions: ['storage', 'alarms'] })).toEqual([]);
  });

  it('collapses any all-sites pattern, from hosts or content scripts, into one warning', () => {
    for (const m of [
      { host_permissions: ['<all_urls>'] },
      { host_permissions: ['*://*/*'] },
      { permissions: ['https://*/*'] },
      { content_scripts: [{ matches: ['http://*/*', 'https://*/*'] }] },
    ])
      expect(permissionWarnings(m)).toEqual([{ key: 'allSites' }]);
  });

  it('lists specific sites once, sorted, from hosts and content scripts', () => {
    expect(
      permissionWarnings({
        host_permissions: ['https://*.github.com/*', 'https://mail.google.com/*'],
        content_scripts: [{ matches: ['https://mail.google.com/*'] }],
      }),
    ).toEqual([{ key: 'someSites', hosts: 'github.com, mail.google.com' }]);
  });

  it('maps API permissions to Chrome-style warnings, deduplicated, in a stable order', () => {
    expect(
      permissionWarnings({
        permissions: ['webNavigation', 'tabs', 'clipboardRead', 'downloads', 'nativeMessaging', 'cookies'],
      }),
    ).toEqual([
      { key: 'history' },
      { key: 'clipboardRead' },
      { key: 'downloads' },
      { key: 'nativeMessaging' },
    ]);
  });

  it('ignores malformed manifests instead of throwing', () => {
    expect(permissionWarnings({ permissions: 'tabs' as unknown as string[] })).toEqual([]);
    expect(permissionWarnings({ content_scripts: [{}] })).toEqual([]);
  });
});
