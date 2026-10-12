import { favoriteTabs, type Container, type Id } from '@vela/core';
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { dispatch, invoke } from '../../lib/api';
import { useShell } from '../../lib/store';

export interface DragItem {
  id: Id;
  type: 'tab' | 'folder';
  label: string;
  emoji: string | null;
  favicon: string | null;
  url: string;
}

export type DropTarget =
  | { kind: 'line'; container: Container; index: number; x: number; y: number; width: number; depth: number }
  | { kind: 'into'; folderId: Id; rect: DOMRect }
  | { kind: 'favorites'; index: number; x: number; y: number; height: number }
  | { kind: 'space'; spaceId: Id; rect: DOMRect }
  | { kind: 'split'; side: 'left' | 'right'; rect: DOMRect }
  /** Dropped onto another tab: the two open side by side (Arc's gesture for a split). */
  | { kind: 'pair'; tabId: Id; rect: DOMRect }
  /** Outside the window: main shows a placeholder window, and the drop tears the tab off (Arc). */
  | { kind: 'window'; screenX: number; screenY: number };

export interface DndState {
  item: DragItem;
  x: number;
  y: number;
  target: DropTarget | null;
}

const START_DISTANCE = 5;

function parseContainer(el: Element): Container | null {
  const raw = el.getAttribute('data-dnd-container');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Container;
  } catch {
    return null;
  }
}

function sameContainer(a: Container, b: Container): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'folder' && b.kind === 'folder') return a.folderId === b.folderId;
  if ((a.kind === 'today' || a.kind === 'pinned') && (b.kind === 'today' || b.kind === 'pinned'))
    return a.spaceId === b.spaceId;
  return a.kind === 'favorites';
}

export function hitTest(x: number, y: number, item: DragItem, root: HTMLElement): DropTarget | null {
  const els = document.elementsFromPoint(x, y);
  const rowEl = els.find((e) => e.hasAttribute('data-dnd-row'));
  if (rowEl) {
    const id = rowEl.getAttribute('data-dnd-row') ?? '';
    const type = rowEl.getAttribute('data-dnd-type');
    const container = parseContainer(rowEl);
    const index = Number(rowEl.getAttribute('data-dnd-index') ?? '0');
    const depth = Number(rowEl.getAttribute('data-dnd-depth') ?? '0');
    const rect = rowEl.getBoundingClientRect();
    if (!container) return null;
    if (id === item.id) return null;
    const rel = (y - rect.top) / rect.height;
    const isFolder = type === 'folder';
    if (isFolder && rel > 0.3 && rel < 0.7) {
      if (item.type === 'folder') return null;
      return { kind: 'into', folderId: id, rect };
    }
    if (item.type === 'tab' && type === 'tab' && rel > 0.3 && rel < 0.7)
      return { kind: 'pair', tabId: id, rect };
    if (item.type === 'folder' && container.kind === 'today') return null;
    const after = rel >= 0.5;
    return {
      kind: 'line',
      container,
      index: after ? index + 1 : index,
      x: rect.left,
      y: after ? rect.bottom : rect.top,
      width: rect.width,
      depth,
    };
  }
  const favCell = els.find((e) => e.hasAttribute('data-dnd-fav'));
  if (favCell && item.type === 'tab') {
    const rect = favCell.getBoundingClientRect();
    const index = Number(favCell.getAttribute('data-dnd-fav') ?? '0');
    const after = x > rect.left + rect.width / 2;
    return {
      kind: 'favorites',
      index: after ? index + 1 : index,
      x: after ? rect.right + 3 : rect.left - 3,
      y: rect.top,
      height: rect.height,
    };
  }
  const spaceDot = els.find((e) => e.hasAttribute('data-dnd-space'));
  if (spaceDot && item.type === 'tab') {
    return {
      kind: 'space',
      spaceId: spaceDot.getAttribute('data-dnd-space') ?? '',
      rect: spaceDot.getBoundingClientRect(),
    };
  }
  const zone = els.find((e) => e.hasAttribute('data-dnd-zone'));
  if (zone) {
    const name = zone.getAttribute('data-dnd-zone');
    const rect = zone.getBoundingClientRect();
    if (name === 'favorites' && item.type === 'tab') {
      const count = Number(zone.getAttribute('data-dnd-count') ?? '0');
      return {
        kind: 'favorites',
        index: count,
        x: rect.left + 10,
        y: rect.top + 6,
        height: Math.max(20, rect.height - 12),
      };
    }
    if (name === 'content' && item.type === 'tab') {
      const side = x < rect.left + rect.width / 2 ? 'left' : 'right';
      return { kind: 'split', side, rect };
    }
    const container = parseContainer(zone);
    if (container) {
      if (item.type === 'folder' && container.kind === 'today') return null;
      const count = Number(zone.getAttribute('data-dnd-count') ?? '0');
      const rootRect = root.getBoundingClientRect();
      return {
        kind: 'line',
        container,
        index: count,
        x: rootRect.left + 8,
        y: rect.top + Math.min(rect.height, 8),
        width: rootRect.width - 16,
        depth: 0,
      };
    }
  }
  return null;
}

function outsideWindow(ev: PointerEvent): boolean {
  return (
    ev.clientX < 0 || ev.clientY < 0 || ev.clientX >= window.innerWidth || ev.clientY >= window.innerHeight
  );
}

export function performDrop(item: DragItem, target: DropTarget): void {
  const core = useShell.getState().core;
  const now = Date.now();
  switch (target.kind) {
    case 'line': {
      const from = findCurrent(item.id);
      let index = target.index;
      if (from && sameContainer(from.container, target.container) && from.index < index) index -= 1;
      if (item.type === 'tab')
        dispatch({ type: 'tab/move', id: item.id, to: { container: target.container, index }, now });
      else dispatch({ type: 'folder/move', id: item.id, to: { container: target.container, index } });
      return;
    }
    case 'pair': {
      // One split of exactly these two: panes that were open with the target drop out first.
      const space = core.spaces[core.activeSpaceId];
      if (!space || target.tabId === item.id) return;
      for (const pane of space.split?.panes ?? []) {
        if (pane !== target.tabId && pane !== item.id)
          dispatch({ type: 'split/remove', spaceId: space.id, tabId: pane });
      }
      dispatch({ type: 'tab/activate', id: target.tabId, now, spaceId: space.id });
      dispatch({ type: 'split/add', spaceId: space.id, tabId: item.id });
      return;
    }
    case 'into': {
      const folder = core.folders[target.folderId];
      const to = {
        container: { kind: 'folder' as const, folderId: target.folderId },
        index: folder?.children.length ?? 0,
      };
      if (item.type === 'tab') dispatch({ type: 'tab/move', id: item.id, to, now });
      else dispatch({ type: 'folder/move', id: item.id, to });
      if (folder?.collapsed) dispatch({ type: 'folder/update', id: folder.id, patch: { collapsed: false } });
      return;
    }
    case 'favorites': {
      // The grid shows this Space's profile only: map its slot back to the global favorites list.
      const shown = favoriteTabs(core);
      const at = shown[target.index];
      const last = shown.at(-1);
      let index = at
        ? core.favorites.indexOf(at.id)
        : last
          ? core.favorites.indexOf(last.id) + 1
          : core.favorites.length;
      const from = findCurrent(item.id);
      if (from?.container.kind === 'favorites' && from.index < index) index -= 1;
      dispatch({ type: 'tab/move', id: item.id, to: { container: { kind: 'favorites' }, index }, now });
      return;
    }
    case 'space':
      if (target.spaceId && core.tabs[item.id]?.spaceId !== target.spaceId) {
        dispatch({
          type: 'tab/move',
          id: item.id,
          to: { container: { kind: 'today', spaceId: target.spaceId }, index: 0 },
          now,
        });
      }
      return;
    case 'window':
      void invoke('tab/dropOut', { tabId: item.id, x: target.screenX, y: target.screenY });
      return;
    case 'split': {
      const space = core.spaces[core.activeSpaceId];
      if (!space) return;
      if (core.tabs[item.id]?.spaceId && core.tabs[item.id]?.spaceId !== space.id) {
        dispatch({
          type: 'tab/move',
          id: item.id,
          to: { container: { kind: 'today', spaceId: space.id }, index: 0 },
          now,
        });
      }
      dispatch({
        type: 'split/add',
        spaceId: space.id,
        tabId: item.id,
        ...(target.side === 'left' ? { index: 0 } : {}),
      });
    }
  }
}

function findCurrent(id: Id): { container: Container; index: number } | null {
  const core = useShell.getState().core;
  const fi = core.favorites.indexOf(id);
  if (fi >= 0) return { container: { kind: 'favorites' }, index: fi };
  for (const sid of core.spaceOrder) {
    const s = core.spaces[sid];
    if (!s) continue;
    const ti = s.today.indexOf(id);
    if (ti >= 0) return { container: { kind: 'today', spaceId: sid }, index: ti };
    const pi = s.pinned.indexOf(id);
    if (pi >= 0) return { container: { kind: 'pinned', spaceId: sid }, index: pi };
  }
  for (const f of Object.values(core.folders)) {
    const ci = f.children.indexOf(id);
    if (ci >= 0) return { container: { kind: 'folder', folderId: f.id }, index: ci };
  }
  return null;
}

export function useSidebarDnd(rootRef: React.RefObject<HTMLElement | null>) {
  const [state, setState] = useState<DndState | null>(null);
  const pending = useRef<{
    item: DragItem;
    startX: number;
    startY: number;
    el: HTMLElement;
    pointerId: number;
  } | null>(null);
  const live = useRef<DndState | null>(null);
  const ghost = useRef<{ frame: number; out: boolean }>({ frame: 0, out: false });

  /** One IPC per frame at most: main moves the placeholder window to the latest screen point. */
  const sendGhost = useCallback((tabId: Id | null, x = 0, y = 0) => {
    const g = ghost.current;
    if (!tabId && !g.out) return;
    g.out = !!tabId;
    cancelAnimationFrame(g.frame);
    g.frame = requestAnimationFrame(() => {
      void invoke('tab/dragOut', tabId ? { tabId, x, y } : null);
    });
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, item: DragItem) => {
      if (e.button !== 0) return;
      pending.current = {
        item,
        startX: e.clientX,
        startY: e.clientY,
        el: e.currentTarget,
        pointerId: e.pointerId,
      };
      const el = e.currentTarget;
      const move = (ev: PointerEvent): void => {
        const p = pending.current;
        if (!p) return;
        if (!live.current) {
          if (Math.hypot(ev.clientX - p.startX, ev.clientY - p.startY) < START_DISTANCE) return;
          try {
            el.setPointerCapture(p.pointerId);
          } catch {
            /* pointer gone */
          }
          document.body.dataset.dragging = 'true';
        }
        const root = rootRef.current;
        const out = p.item.type === 'tab' && outsideWindow(ev);
        sendGhost(out ? p.item.id : null, ev.screenX, ev.screenY);
        const target: DropTarget | null = out
          ? { kind: 'window', screenX: ev.screenX, screenY: ev.screenY }
          : root
            ? hitTest(ev.clientX, ev.clientY, p.item, root)
            : null;
        live.current = { item: p.item, x: ev.clientX, y: ev.clientY, target };
        setState(live.current);
      };
      const up = (ev: PointerEvent): void => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        const current = live.current;
        if (current) {
          // Swallow the click that follows a completed drag so the row is not activated.
          const eat = (ev: Event): void => {
            ev.stopPropagation();
            ev.preventDefault();
          };
          window.addEventListener('click', eat, { capture: true, once: true });
          setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 0);
        }
        const g = ghost.current;
        cancelAnimationFrame(g.frame);
        const tearing = current?.target?.kind === 'window' && ev.type === 'pointerup';
        if (g.out && !tearing) void invoke('tab/dragOut', null);
        g.out = false;
        if (current?.target && (ev.type === 'pointerup' || current.target.kind !== 'window'))
          performDrop(current.item, current.target);
        live.current = null;
        pending.current = null;
        delete document.body.dataset.dragging;
        setState(null);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    },
    [rootRef, sendGhost],
  );

  return { dnd: state, onPointerDown };
}
