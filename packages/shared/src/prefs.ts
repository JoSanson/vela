import type { LanguagePref } from './i18n';
import { DEFAULT_SITE_SEARCHES, type SiteSearch } from './siteSearch';

export type AutoArchiveHours = 12 | 24 | 168 | 720;

export interface Prefs {
  version: number;
  searchEngineId: string;
  sidebarWidth: number;
  sidebarHidden: boolean;
  autoArchiveHours: AutoArchiveHours;
  memorySaverEnabled: boolean;
  memorySaverMinutes: number;
  autoPip: boolean;
  theme: 'system' | 'light' | 'dark';
  onboardingDone: boolean;
  importedFrom: string | null;
  blockerEnabled: boolean;
  blockerDisabledHosts: string[];
  autoUpdate: boolean;
  /** Translucent sidebar (vibrancy on macOS). */
  glass: boolean;
  /** Unpacked extension folders to load at startup. */
  extensionPaths: string[];
  /** Extension ids shown as tiles under the URL field, in order. */
  extensionPins: string[];
  /** Every extension id ever installed, so a new one is pinned once and an unpin sticks. */
  extensionSeen: string[];
  /** Host → zoom factor. */
  zoomByHost: Record<string, number>;
  windowBounds: { x: number; y: number; width: number; height: number } | null;
  /** HTTPS-first: upgrade plain http:// navigations, fall back silently when the site has no TLS. */
  httpsUpgrade: boolean;
  /** Remembered answers for external-app links (`zoommtg:`, `slack:`…), keyed by scheme. */
  externalSchemes: Record<string, 'allow' | 'deny'>;
  /** null = the OS downloads folder. */
  downloadDir: string | null;
  askWhereToSave: boolean;
  /** Block known phishing/malware sites (local lists from public feeds). */
  safeBrowsing: boolean;
  /** Custom accelerators by shortcut id (see packages/shared/src/shortcuts.ts). */
  shortcutOverrides: Record<string, string>;
  /** UI language; 'system' follows the OS. */
  language: LanguagePref;
  /** Command bar keywords: `y` then Tab searches YouTube. */
  siteSearches: SiteSearch[];
}

export const DEFAULT_PREFS: Prefs = {
  version: 1,
  searchEngineId: 'google',
  sidebarWidth: 260,
  sidebarHidden: false,
  autoArchiveHours: 24,
  memorySaverEnabled: true,
  memorySaverMinutes: 60,
  autoPip: true,
  theme: 'system',
  onboardingDone: false,
  importedFrom: null,
  blockerEnabled: true,
  blockerDisabledHosts: [],
  autoUpdate: true,
  glass: false,
  extensionPaths: [],
  extensionPins: [],
  extensionSeen: [],
  zoomByHost: {},
  windowBounds: null,
  httpsUpgrade: true,
  externalSchemes: {},
  downloadDir: null,
  askWhereToSave: false,
  safeBrowsing: true,
  shortcutOverrides: {},
  language: 'system',
  siteSearches: [...DEFAULT_SITE_SEARCHES],
};

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 480;
