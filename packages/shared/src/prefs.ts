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
  /** Host → zoom factor. */
  zoomByHost: Record<string, number>;
  windowBounds: { x: number; y: number; width: number; height: number } | null;
}

export const DEFAULT_PREFS: Prefs = {
  version: 1,
  searchEngineId: 'google',
  sidebarWidth: 260,
  sidebarHidden: false,
  autoArchiveHours: 24,
  memorySaverEnabled: true,
  memorySaverMinutes: 20,
  autoPip: true,
  theme: 'system',
  onboardingDone: false,
  importedFrom: null,
  blockerEnabled: true,
  blockerDisabledHosts: [],
  autoUpdate: true,
  zoomByHost: {},
  windowBounds: null,
};

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 480;
