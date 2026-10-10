import { createDefaultState, type CoreState, type Id } from '@vela/core';
import {
  DEFAULT_PREFS,
  type OverlayState,
  type Platform,
  type Prefs,
  type ShellSnapshot,
} from '@vela/shared';
import { create } from 'zustand';
import { vela } from './api';

export interface ShellStore {
  ready: boolean;
  core: CoreState;
  prefs: Prefs;
  platform: Platform;
  version: string;
  little: { tabId: Id } | null;
  overlay: OverlayState;
  fullscreen: boolean;
  sidebarVisible: boolean;
  sidebarWidth: number;
  findOpen: boolean;
  downloadsOpen: boolean;
  editingSpaceId: Id | null;
  editingItemId: Id | null;
  iconPickerFor: Id | null;
  topStrip: number;
  siteControlOpen: boolean;
  hydrate: (snap: ShellSnapshot) => void;
  setCore: (core: CoreState) => void;
  setPrefs: (prefs: Prefs) => void;
  setOverlay: (overlay: OverlayState) => void;
  setFullscreen: (v: boolean) => void;
  setSidebarVisible: (v: boolean) => void;
  setSidebarWidth: (w: number) => void;
  setFindOpen: (v: boolean) => void;
  setDownloadsOpen: (v: boolean) => void;
  setEditingSpace: (id: Id | null) => void;
  setEditingItem: (id: Id | null) => void;
  setIconPickerFor: (id: Id | null) => void;
  setTopStrip: (px: number) => void;
  setSiteControlOpen: (v: boolean) => void;
}

export const useShell = create<ShellStore>((set) => ({
  ready: false,
  core: createDefaultState(0),
  prefs: DEFAULT_PREFS,
  platform: vela.platform,
  version: '',
  little: null,
  overlay: { kind: 'none', payload: null },
  fullscreen: false,
  sidebarVisible: true,
  sidebarWidth: DEFAULT_PREFS.sidebarWidth,
  findOpen: false,
  downloadsOpen: false,
  editingSpaceId: null,
  editingItemId: null,
  iconPickerFor: null,
  topStrip: 0,
  siteControlOpen: false,
  hydrate: (snap) =>
    set({
      ready: true,
      core: snap.state,
      prefs: snap.prefs,
      platform: snap.platform,
      version: snap.version,
      little: snap.little,
      overlay: snap.overlay,
      sidebarVisible: !snap.prefs.sidebarHidden,
      sidebarWidth: snap.prefs.sidebarWidth,
    }),
  setCore: (core) => set({ core }),
  setPrefs: (prefs) => set({ prefs }),
  setOverlay: (overlay) => set({ overlay }),
  setFullscreen: (fullscreen) => set({ fullscreen }),
  setSidebarVisible: (sidebarVisible) => set({ sidebarVisible }),
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
  setFindOpen: (findOpen) => set({ findOpen }),
  setDownloadsOpen: (downloadsOpen) => set({ downloadsOpen }),
  setEditingSpace: (editingSpaceId) => set({ editingSpaceId }),
  setEditingItem: (editingItemId) => set({ editingItemId }),
  setIconPickerFor: (iconPickerFor) => set({ iconPickerFor }),
  setTopStrip: (topStrip) => set({ topStrip }),
  setSiteControlOpen: (siteControlOpen) => set({ siteControlOpen }),
}));

/** Loads the snapshot and keeps the store in sync with main. Returns an unsubscribe. */
export function connectStore(): () => void {
  const s = useShell.getState();
  void vela.invoke('snapshot/get', undefined).then((snap) => useShell.getState().hydrate(snap));
  const offs = [
    vela.on('state/changed', (core) => s.setCore(core)),
    vela.on('prefs/changed', (prefs) => s.setPrefs(prefs)),
    vela.on('overlay/changed', (o) => s.setOverlay(o)),
    vela.on('window/fullscreen', (v) => s.setFullscreen(v)),
  ];
  return () => offs.forEach((off) => off());
}

export const selectActiveSpace = (st: ShellStore) => st.core.spaces[st.core.activeSpaceId];
export const selectActiveTab = (st: ShellStore) => {
  const sp = st.core.spaces[st.core.activeSpaceId];
  return sp?.activeTabId ? st.core.tabs[sp.activeTabId] : undefined;
};
