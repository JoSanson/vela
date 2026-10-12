/** The subset of a manifest that grants access; everything is optional because manifests are untrusted. */
export interface PermissionManifest {
  permissions?: string[];
  optional_permissions?: string[];
  host_permissions?: string[];
  content_scripts?: { matches?: string[] }[];
}

export type PermissionWarning =
  { key: 'allSites' } | { key: 'someSites'; hosts: string } | { key: ApiWarning };

type ApiWarning =
  | 'history'
  | 'bookmarks'
  | 'clipboardRead'
  | 'clipboardWrite'
  | 'downloads'
  | 'notifications'
  | 'nativeMessaging'
  | 'management'
  | 'privacy'
  | 'geolocation'
  | 'blockContent';

/** Chrome's install-prompt wording, keyed by API permission; order is the order shown. */
const API_WARNINGS: [ApiWarning, string[]][] = [
  ['history', ['tabs', 'webNavigation', 'history']],
  ['bookmarks', ['bookmarks']],
  ['clipboardRead', ['clipboardRead']],
  ['clipboardWrite', ['clipboardWrite']],
  ['downloads', ['downloads']],
  ['notifications', ['notifications']],
  ['nativeMessaging', ['nativeMessaging']],
  ['management', ['management']],
  ['privacy', ['privacy']],
  ['geolocation', ['geolocation']],
  ['blockContent', ['declarativeNetRequest', 'webRequestBlocking']],
];

const ALL_SITES = /^(<all_urls>|(\*|https?):\/\/\*\/.*)$/;
const HOST = /^(?:\*|https?|wss?):\/\/(?:\*\.)?([^/]+)\//;

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** What an extension will be able to do, in the terms Chrome uses when you click "Add to Chrome". */
export function permissionWarnings(manifest: PermissionManifest): PermissionWarning[] {
  const apis = new Set(strings(manifest.permissions));
  // MV2 put host patterns in `permissions`; content scripts also grant access to the pages they match.
  const patterns = [
    ...strings(manifest.host_permissions),
    ...[...apis].filter((p) => p.includes('://') || p === '<all_urls>'),
    ...(Array.isArray(manifest.content_scripts) ? manifest.content_scripts : []).flatMap((c) =>
      strings(c?.matches),
    ),
  ];
  const out: PermissionWarning[] = [];
  if (patterns.some((p) => ALL_SITES.test(p))) out.push({ key: 'allSites' });
  else {
    const hosts = [...new Set(patterns.map((p) => HOST.exec(p)?.[1]).filter((h): h is string => !!h))].sort();
    if (hosts.length) out.push({ key: 'someSites', hosts: hosts.join(', ') });
  }
  for (const [key, names] of API_WARNINGS) if (names.some((n) => apis.has(n))) out.push({ key });
  return out;
}
