import { applyDelta, createDefaultState, type CoreState, type Id, type StateDelta } from '@vela/core';
import {
  DEFAULT_PREFS,
  type OverlayState,
  type Platform,
  type Prefs,
  type ShellSnapshot,
} from '@vela/shared';
import { create } from 'zustand';
import { setFaviconToken } from '../components/Favicon';
import { vela } from './api';

export interface ShellStore {
  ready: boolean;
  core: CoreState;
  rev: number;
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
  toast: { text: string; action?: { label: string; run: () => void } } | null;
  showToast: (toast: ShellStore['toast']) => void;
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
  rev: 0,
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
  toast: null,
  showToast: (toast) => set({ toast }),
  hydrate: (snap) => {
    setFaviconToken(snap.faviconToken);
    set({
      ready: true,
      core: snap.state,
      rev: snap.rev,
      prefs: snap.prefs,
      platform: snap.platform,
      version: snap.version,
      little: snap.little,
      overlay: snap.overlay,
      sidebarVisible: !snap.prefs.sidebarHidden,
      sidebarWidth: snap.prefs.sidebarWidth,
    });
  },
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
  const resync = (): Promise<void> =>
    vela.invoke('snapshot/get', undefined).then((snap) => useShell.getState().hydrate(snap));
  void resync();
  let resyncing = false;
  const onDelta = (delta: StateDelta): void => {
    const st = useShell.getState();
    if (!st.ready) return;
    const res = applyDelta(st.core, st.rev, delta);
    if ('resync' in res) {
      if (resyncing) return;
      resyncing = true;
      void resync().finally(() => {
        resyncing = false;
      });
      return;
    }
    useShell.setState({ core: res.state, rev: res.rev });
  };
  const offs = [
    vela.on('state/changed', onDelta),
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
