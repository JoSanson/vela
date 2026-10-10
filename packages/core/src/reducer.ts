import type { CoreAction } from './actions';
import { toArchived } from './factories';
import type {
  ArchiveReason,
  Container,
  CoreState,
  Folder,
  Id,
  MoveTarget,
  Space,
  SplitLayout,
  Tab,
} from './types';

const MAX_SPLIT_PANES = 4;

function without<T>(list: readonly T[], item: T): T[] {
  return list.filter((x) => x !== item);
}

function insertAt<T>(list: readonly T[], item: T, index: number | undefined): T[] {
  const copy = without(list, item);
  const i = index === undefined ? copy.length : Math.max(0, Math.min(index, copy.length));
  copy.splice(i, 0, item);
  return copy;
}

function equalSizes(n: number): number[] {
  return Array.from({ length: n }, () => 1 / n);
}

function updateSpace(state: CoreState, id: Id, fn: (s: Space) => Space): CoreState {
  const space = state.spaces[id];
  if (!space) return state;
  return { ...state, spaces: { ...state.spaces, [id]: fn(space) } };
}

function updateTab(state: CoreState, id: Id, fn: (t: Tab) => Tab): CoreState {
  const tab = state.tabs[id];
  if (!tab) return state;
  return { ...state, tabs: { ...state.tabs, [id]: fn(tab) } };
}

function updateFolder(state: CoreState, id: Id, fn: (f: Folder) => Folder): CoreState {
  const folder = state.folders[id];
  if (!folder) return state;
  return { ...state, folders: { ...state.folders, [id]: fn(folder) } };
}

/** Removes an item id (tab or folder) from every container it may sit in. */
function detach(state: CoreState, id: Id): CoreState {
  let next = state;
  if (next.favorites.includes(id)) next = { ...next, favorites: without(next.favorites, id) };
  for (const sid of next.spaceOrder) {
    const s = next.spaces[sid];
    if (!s) continue;
    if (s.today.includes(id) || s.pinned.includes(id)) {
      next = updateSpace(next, sid, (sp) => ({
        ...sp,
        today: without(sp.today, id),
        pinned: without(sp.pinned, id),
      }));
    }
  }
  for (const fid of Object.keys(next.folders)) {
    const f = next.folders[fid];
    if (f?.children.includes(id))
      next = updateFolder(next, fid, (fo) => ({ ...fo, children: without(fo.children, id) }));
  }
  return next;
}

export function findContainer(state: CoreState, id: Id): MoveTarget | null {
  const fi = state.favorites.indexOf(id);
  if (fi >= 0) return { container: { kind: 'favorites' }, index: fi };
  for (const sid of state.spaceOrder) {
    const s = state.spaces[sid];
    if (!s) continue;
    const ti = s.today.indexOf(id);
    if (ti >= 0) return { container: { kind: 'today', spaceId: sid }, index: ti };
    const pi = s.pinned.indexOf(id);
    if (pi >= 0) return { container: { kind: 'pinned', spaceId: sid }, index: pi };
  }
  for (const f of Object.values(state.folders)) {
    const ci = f.children.indexOf(id);
    if (ci >= 0) return { container: { kind: 'folder', folderId: f.id }, index: ci };
  }
  return null;
}

function containerSpaceId(state: CoreState, c: Container): Id | null {
  switch (c.kind) {
    case 'favorites':
      return null;
    case 'folder':
      return state.folders[c.folderId]?.spaceId ?? null;
    default:
      return state.spaces[c.spaceId] ? c.spaceId : null;
  }
}

function attach(state: CoreState, id: Id, target: MoveTarget): CoreState {
  const c = target.container;
  switch (c.kind) {
    case 'favorites':
      return { ...state, favorites: insertAt(state.favorites, id, target.index) };
    case 'today':
      return updateSpace(state, c.spaceId, (s) => ({ ...s, today: insertAt(s.today, id, target.index) }));
    case 'pinned':
      return updateSpace(state, c.spaceId, (s) => ({ ...s, pinned: insertAt(s.pinned, id, target.index) }));
    case 'folder':
      return updateFolder(state, c.folderId, (f) => ({
        ...f,
        children: insertAt(f.children, id, target.index),
      }));
  }
}

function removeFromSplit(state: CoreState, spaceId: Id | null, tabId: Id): CoreState {
  const ids = spaceId ? [spaceId] : state.spaceOrder;
  let next = state;
  for (const sid of ids) {
    const s = next.spaces[sid];
    if (!s?.split?.panes.includes(tabId)) continue;
    const panes = without(s.split.panes, tabId);
    const layout: SplitLayout | null = panes.length >= 2 ? { panes, sizes: equalSizes(panes.length) } : null;
    next = updateSpace(next, sid, (sp) => ({ ...sp, split: layout }));
  }
  return next;
}

function touchMru(state: CoreState, id: Id): CoreState {
  return { ...state, mru: [id, ...without(state.mru, id)] };
}

/** Picks the tab to activate in a space after `closedId` goes away. */
function nextActiveTab(state: CoreState, space: Space, closedId: Id): Id | null {
  for (const id of state.mru) {
    if (id === closedId) continue;
    const t = state.tabs[id];
    if (!t) continue;
    if (t.spaceId === space.id || (t.kind === 'favorite' && space.activeTabId === id)) return id;
  }
  const idx = space.today.indexOf(closedId);
  const candidates = [
    ...space.today.slice(idx + 1),
    ...space.today.slice(0, Math.max(0, idx)).reverse(),
  ].filter((id) => id !== closedId);
  return candidates[0] ?? null;
}

function archiveTab(state: CoreState, tab: Tab, now: number, reason: ArchiveReason): CoreState {
  const spaceName = (tab.spaceId && state.spaces[tab.spaceId]?.name) || 'Favorites';
  const entry = toArchived(tab, spaceName, now, reason);
  return { ...state, archive: [entry, ...state.archive.filter((a) => a.id !== tab.id)] };
}

function deleteTab(state: CoreState, id: Id, now: number, reason: ArchiveReason | null): CoreState {
  const tab = state.tabs[id];
  if (!tab) return state;
  let next = detach(state, id);
  next = removeFromSplit(next, null, id);
  for (const sid of next.spaceOrder) {
    const s = next.spaces[sid];
    if (s?.activeTabId === id) {
      // Use the pre-detach space so the closed tab's position in `today` still resolves neighbours.
      const replacement = nextActiveTab(next, state.spaces[sid] ?? s, id);
      next = updateSpace(next, sid, (sp) => ({ ...sp, activeTabId: replacement }));
    }
  }
  const tabs = { ...next.tabs };
  delete tabs[id];
  next = { ...next, tabs, mru: without(next.mru, id) };
  if (reason && tab.url && !tab.url.startsWith('vela://')) next = archiveTab(next, tab, now, reason);
  return next;
}

function activateTab(state: CoreState, id: Id, now: number): CoreState {
  const tab = state.tabs[id];
  if (!tab) return state;
  const spaceId = tab.spaceId ?? state.activeSpaceId;
  if (!state.spaces[spaceId]) return state;
  let next = updateSpace(state, spaceId, (s) => ({ ...s, activeTabId: id }));
  next = updateTab(next, id, (t) => ({ ...t, lastActiveAt: now }));
  next = touchMru(next, id);
  return { ...next, activeSpaceId: spaceId };
}

function kindForContainer(c: Container): Tab['kind'] {
  if (c.kind === 'favorites') return 'favorite';
  if (c.kind === 'today') return 'today';
  return 'pinned';
}

function moveTab(state: CoreState, id: Id, to: MoveTarget, now: number): CoreState {
  const tab = state.tabs[id];
  if (!tab) return state;
  const targetSpaceId = containerSpaceId(state, to.container);
  if (to.container.kind !== 'favorites' && !targetSpaceId) return state;
  const kind = kindForContainer(to.container);
  let next = detach(state, id);
  const prevSpaceId = tab.spaceId;
  if (prevSpaceId && prevSpaceId !== targetSpaceId) {
    next = removeFromSplit(next, prevSpaceId, id);
    const prev = next.spaces[prevSpaceId];
    if (prev?.activeTabId === id) {
      const replacement = nextActiveTab(next, state.spaces[prevSpaceId] ?? prev, id);
      next = updateSpace(next, prevSpaceId, (sp) => ({ ...sp, activeTabId: replacement }));
    }
  }
  next = updateTab(next, id, (t) => ({
    ...t,
    kind,
    spaceId: targetSpaceId,
    homeUrl: kind === 'today' ? null : (t.homeUrl ?? t.url),
    lastActiveAt: kind === 'today' ? now : t.lastActiveAt,
  }));
  return attach(next, id, to);
}

function isDescendantFolder(state: CoreState, folderId: Id, maybeAncestorId: Id): boolean {
  if (folderId === maybeAncestorId) return true;
  const f = state.folders[maybeAncestorId];
  if (!f) return false;
  return f.children.some((c) => state.folders[c] !== undefined && isDescendantFolder(state, folderId, c));
}

function deleteSpace(state: CoreState, id: Id, now: number): CoreState {
  if (state.spaceOrder.length <= 1) return state;
  const space = state.spaces[id];
  if (!space) return state;
  let next = state;
  const tabIds = Object.values(next.tabs)
    .filter((t) => t.spaceId === id)
    .map((t) => t.id);
  for (const tid of tabIds) next = deleteTab(next, tid, now, 'closed');
  const folders = { ...next.folders };
  for (const f of Object.values(folders)) if (f.spaceId === id) delete folders[f.id];
  const spaces = { ...next.spaces };
  delete spaces[id];
  const spaceOrder = without(next.spaceOrder, id);
  const idx = Math.min(next.spaceOrder.indexOf(id), spaceOrder.length - 1);
  const activeSpaceId =
    next.activeSpaceId === id ? (spaceOrder[Math.max(0, idx)] ?? spaceOrder[0] ?? id) : next.activeSpaceId;
  return { ...next, spaces, folders, spaceOrder, activeSpaceId };
}

export function reduce(state: CoreState, action: CoreAction): CoreState {
  switch (action.type) {
    case 'state/replace':
      return action.state;

    case 'space/create': {
      if (state.spaces[action.space.id]) return state;
      return {
        ...state,
        spaces: { ...state.spaces, [action.space.id]: action.space },
        spaceOrder: insertAt(state.spaceOrder, action.space.id, action.index),
      };
    }
    case 'space/update':
      return updateSpace(state, action.id, (s) => ({ ...s, ...action.patch }));
    case 'space/delete':
      return deleteSpace(state, action.id, action.now);
    case 'space/reorder': {
      const valid =
        action.order.length === state.spaceOrder.length &&
        action.order.every((id) => state.spaceOrder.includes(id));
      return valid ? { ...state, spaceOrder: [...action.order] } : state;
    }
    case 'space/activate': {
      const space = state.spaces[action.id];
      if (!space) return state;
      let next: CoreState = { ...state, activeSpaceId: action.id };
      if (space.activeTabId && next.tabs[space.activeTabId]) {
        next = touchMru(next, space.activeTabId);
        next = updateTab(next, space.activeTabId, (t) => ({ ...t, lastActiveAt: action.now }));
      }
      return next;
    }

    case 'space/setActiveTab': {
      if (action.tabId && !state.tabs[action.tabId]) return state;
      return updateSpace(state, action.spaceId, (s) => ({ ...s, activeTabId: action.tabId }));
    }

    case 'tab/open': {
      const tab = action.tab;
      if (state.tabs[tab.id]) return state;
      let next: CoreState = { ...state, tabs: { ...state.tabs, [tab.id]: tab } };
      if (tab.kind === 'favorite') {
        next = attach(next, tab.id, {
          container: { kind: 'favorites' },
          index: action.index ?? next.favorites.length,
        });
      } else {
        const spaceId = tab.spaceId ?? state.activeSpaceId;
        if (!next.spaces[spaceId]) return state;
        if (tab.spaceId !== spaceId) next = updateTab(next, tab.id, (t) => ({ ...t, spaceId }));
        const kind = tab.kind === 'pinned' ? 'pinned' : 'today';
        const index = action.index ?? (kind === 'today' ? 0 : undefined);
        next = attach(next, tab.id, {
          container: { kind, spaceId },
          index: index ?? Number.MAX_SAFE_INTEGER,
        });
      }
      return action.activate ? activateTab(next, tab.id, tab.createdAt) : next;
    }
    case 'tab/activate':
      return activateTab(state, action.id, action.now);
    case 'tab/close': {
      const tab = state.tabs[action.id];
      if (!tab) return state;
      return deleteTab(state, action.id, action.now, action.reason ?? 'closed');
    }
    case 'tab/update':
      return updateTab(state, action.id, (t) => ({ ...t, ...action.patch }));
    case 'tab/pin': {
      const tab = state.tabs[action.id];
      if (tab?.kind !== 'today' || !tab.spaceId) return state;
      return moveTab(
        state,
        action.id,
        {
          container: { kind: 'pinned', spaceId: tab.spaceId },
          index: action.index ?? Number.MAX_SAFE_INTEGER,
        },
        tab.lastActiveAt,
      );
    }
    case 'tab/unpin': {
      const tab = state.tabs[action.id];
      if (!tab || tab.kind === 'today') return state;
      const spaceId = tab.spaceId ?? state.activeSpaceId;
      return moveTab(state, action.id, { container: { kind: 'today', spaceId }, index: 0 }, action.now);
    }
    case 'tab/favorite': {
      const tab = state.tabs[action.id];
      if (!tab || tab.kind === 'favorite') return state;
      return moveTab(
        state,
        action.id,
        { container: { kind: 'favorites' }, index: action.index ?? Number.MAX_SAFE_INTEGER },
        tab.lastActiveAt,
      );
    }
    case 'tab/move':
      return moveTab(state, action.id, action.to, action.now);
    case 'tab/reset':
      return updateTab(state, action.id, (t) => ({
        ...t,
        url: t.homeUrl ?? t.url,
        loaded: false,
        sleeping: false,
        loading: false,
        canGoBack: false,
        canGoForward: false,
        audible: false,
        scrollY: 0,
      }));

    case 'folder/create': {
      const folder = action.folder;
      if (state.folders[folder.id] || !state.spaces[folder.spaceId]) return state;
      let next: CoreState = { ...state, folders: { ...state.folders, [folder.id]: folder } };
      const parent = action.parentFolderId ? next.folders[action.parentFolderId] : undefined;
      if (action.parentFolderId && parent?.spaceId !== folder.spaceId) return state;
      const container: Container = parent
        ? { kind: 'folder', folderId: parent.id }
        : { kind: 'pinned', spaceId: folder.spaceId };
      next = attach(next, folder.id, { container, index: action.index ?? Number.MAX_SAFE_INTEGER });
      return next;
    }
    case 'folder/update':
      return updateFolder(state, action.id, (f) => ({ ...f, ...action.patch }));
    case 'folder/delete': {
      const folder = state.folders[action.id];
      if (!folder) return state;
      const where = findContainer(state, action.id);
      let next = detach(state, action.id);
      if (where) {
        folder.children.forEach((childId, i) => {
          next = attach(next, childId, { container: where.container, index: where.index + i });
        });
      }
      const folders = { ...next.folders };
      delete folders[action.id];
      return { ...next, folders };
    }
    case 'folder/move': {
      const folder = state.folders[action.id];
      if (!folder) return state;
      const c = action.to.container;
      if (c.kind === 'today' || c.kind === 'favorites') return state;
      if (c.kind === 'folder' && isDescendantFolder(state, c.folderId, action.id)) return state;
      if (containerSpaceId(state, c) !== folder.spaceId) return state;
      return attach(detach(state, action.id), action.id, action.to);
    }

    case 'archive/restore': {
      const entry = state.archive.find((a) => a.id === action.id);
      if (!entry || state.tabs[action.newTabId]) return state;
      const spaceId = entry.spaceId && state.spaces[entry.spaceId] ? entry.spaceId : state.activeSpaceId;
      const tab: Tab = {
        id: action.newTabId,
        kind: 'today',
        spaceId,
        url: entry.url,
        homeUrl: null,
        title: entry.title,
        customTitle: null,
        emoji: null,
        favicon: entry.favicon,
        createdAt: action.now,
        lastActiveAt: action.now,
        loading: false,
        canGoBack: false,
        canGoForward: false,
        audible: false,
        muted: false,
        sleeping: false,
        alwaysActive: false,
        loaded: false,
        zoom: 1,
        scrollY: 0,
      };
      const next: CoreState = { ...state, archive: state.archive.filter((a) => a.id !== action.id) };
      return reduce(next, { type: 'tab/open', tab, activate: true });
    }
    case 'archive/remove':
      return { ...state, archive: state.archive.filter((a) => a.id !== action.id) };
    case 'archive/clear':
      return { ...state, archive: [] };

    case 'maintenance/autoArchive': {
      const keep = new Set(action.keepTabIds ?? []);
      const cutoff = action.now - action.maxAgeMs;
      let next = state;
      for (const sid of state.spaceOrder) {
        const s = state.spaces[sid];
        if (!s) continue;
        for (const tid of s.today) {
          const t = state.tabs[tid];
          if (t?.kind !== 'today') continue;
          if (t.lastActiveAt >= cutoff || keep.has(tid) || s.activeTabId === tid || t.audible) continue;
          if (s.split?.panes.includes(tid)) continue;
          next = deleteTab(next, tid, action.now, 'auto');
        }
      }
      return next;
    }
    case 'maintenance/pruneArchive':
      return state.archive.length > action.max
        ? { ...state, archive: state.archive.slice(0, action.max) }
        : state;

    case 'split/set': {
      const layout = action.layout;
      if (layout) {
        const unique = new Set(layout.panes);
        if (
          layout.panes.length < 2 ||
          layout.panes.length > MAX_SPLIT_PANES ||
          unique.size !== layout.panes.length
        )
          return state;
        if (!layout.panes.every((id) => state.tabs[id])) return state;
        const sizes =
          layout.sizes.length === layout.panes.length && layout.sizes.every((n) => n > 0)
            ? normalize(layout.sizes)
            : equalSizes(layout.panes.length);
        return updateSpace(state, action.spaceId, (s) => ({
          ...s,
          split: { panes: [...layout.panes], sizes },
        }));
      }
      return updateSpace(state, action.spaceId, (s) => ({ ...s, split: null }));
    }
    case 'split/add': {
      const space = state.spaces[action.spaceId];
      if (!space || !state.tabs[action.tabId]) return state;
      const base =
        space.split?.panes ??
        (space.activeTabId && space.activeTabId !== action.tabId ? [space.activeTabId] : []);
      if (base.includes(action.tabId)) return state;
      if (base.length + 1 > MAX_SPLIT_PANES) return state;
      const panes = insertAt(base, action.tabId, action.index);
      if (panes.length < 2) return state;
      return updateSpace(state, action.spaceId, (s) => ({
        ...s,
        split: { panes, sizes: equalSizes(panes.length) },
      }));
    }
    case 'split/remove':
      return removeFromSplit(state, action.spaceId, action.tabId);
    case 'split/resize': {
      const space = state.spaces[action.spaceId];
      if (space?.split?.panes.length !== action.sizes.length) return state;
      if (action.sizes.some((n) => n <= 0 || Number.isNaN(n))) return state;
      const sizes = normalize(action.sizes);
      return updateSpace(state, action.spaceId, (s) =>
        s.split ? { ...s, split: { ...s.split, sizes } } : s,
      );
    }

    case 'atc/set':
      return { ...state, atcRules: [...action.rules] };

    case 'profile/create':
      return state.profiles[action.profile.id]
        ? state
        : { ...state, profiles: { ...state.profiles, [action.profile.id]: action.profile } };
    case 'profile/update': {
      const p = state.profiles[action.id];
      return p
        ? { ...state, profiles: { ...state.profiles, [action.id]: { ...p, ...action.patch } } }
        : state;
    }
    case 'profile/delete': {
      if (!state.profiles[action.id]) return state;
      const profiles = { ...state.profiles };
      delete profiles[action.id];
      let next: CoreState = { ...state, profiles };
      for (const sid of next.spaceOrder) {
        if (next.spaces[sid]?.profileId === action.id)
          next = updateSpace(next, sid, (s) => ({ ...s, profileId: null }));
      }
      return next;
    }
  }
}

function normalize(sizes: readonly number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  return total > 0 ? sizes.map((s) => s / total) : equalSizes(sizes.length);
}
