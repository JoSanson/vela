import { createFolder, type Id } from '@vela/core';
import { useCallback, useEffect, useRef, useState, type WheelEvent } from 'react';
import { dispatch, vela } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { useShell } from '../../lib/store';
import { EmojiPicker } from '../EmojiPicker';
import { useSidebarDnd } from './dnd';
import { DndLayer } from './DndLayer';
import { FavoritesGrid } from './FavoritesGrid';
import { NavBar } from './NavBar';
import { PinnedList } from './PinnedList';
import { SpaceBar } from './SpaceBar';
import { SpaceHeader } from './SpaceHeader';
import { TodayList } from './TodayList';
import styles from './Sidebar.module.css';

interface Props {
  width: number;
  onToggle: () => void;
  floating?: boolean;
}

const SWIPE_THRESHOLD = 140;

export function Sidebar({ width, onToggle, floating = false }: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const { dnd, onPointerDown } = useSidebarDnd(rootRef);
  const core = useShell((s) => s.core);
  const iconPickerFor = useShell((s) => s.iconPickerFor);
  const setIconPickerFor = useShell((s) => s.setIconPickerFor);
  const setEditing = useShell((s) => s.setEditingItem);
  const t = useT();
  const [slide, setSlide] = useState<'left' | 'right' | null>(null);
  const prevSpaceIdx = useRef(core.spaceOrder.indexOf(core.activeSpaceId));
  const swipe = useRef({ acc: 0, at: 0 });

  const spaceIdx = core.spaceOrder.indexOf(core.activeSpaceId);
  useEffect(() => {
    const prev = prevSpaceIdx.current;
    if (prev !== spaceIdx && prev >= 0) {
      setSlide(spaceIdx > prev ? 'right' : 'left');
      const timer = setTimeout(() => setSlide(null), 260);
      prevSpaceIdx.current = spaceIdx;
      return () => clearTimeout(timer);
    }
    prevSpaceIdx.current = spaceIdx;
    return undefined;
  }, [spaceIdx]);

  useEffect(() => {
    return vela.on('ui/command', ({ id, payload }) => {
      const p = (payload ?? {}) as { id?: Id; parentFolderId?: Id };
      if (id === 'renameItem' && p.id) setEditing(p.id);
      if (id === 'pickIcon' && p.id) setIconPickerFor(p.id);
      if (id === 'newFolder') {
        const st = useShell.getState().core;
        const folder = createFolder({ spaceId: st.activeSpaceId, name: t('shell.sidebar.newFolder') });
        dispatch({
          type: 'folder/create',
          folder,
          ...(p.parentFolderId ? { parentFolderId: p.parentFolderId } : {}),
        });
        setEditing(folder.id);
      }
    });
  }, [setEditing, setIconPickerFor, t]);

  const onWheel = useCallback((e: WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const now = Date.now();
    if (now - swipe.current.at > 400) swipe.current.acc = 0;
    swipe.current.at = now;
    swipe.current.acc += e.deltaX;
    if (Math.abs(swipe.current.acc) >= SWIPE_THRESHOLD) {
      const st = useShell.getState().core;
      const idx = st.spaceOrder.indexOf(st.activeSpaceId);
      const next = st.spaceOrder[idx + (swipe.current.acc > 0 ? 1 : -1)];
      swipe.current.acc = -Math.sign(swipe.current.acc) * SWIPE_THRESHOLD * 2;
      if (next) dispatch({ type: 'space/activate', id: next, now });
    }
  }, []);

  // Roving focus between tree items: ↑/↓ move, Home/End jump, ←/→ collapse/expand folders.
  const onTreeKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement) return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="treeitem"]'));
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const focus = (i: number): void => {
      const el = items[Math.max(0, Math.min(items.length - 1, i))];
      if (!el) return;
      for (const it of items) it.tabIndex = it === el ? 0 : -1;
      el.focus();
      e.preventDefault();
    };
    switch (e.key) {
      case 'ArrowDown':
        focus(idx + 1);
        break;
      case 'ArrowUp':
        focus(idx - 1);
        break;
      case 'Home':
        focus(0);
        break;
      case 'End':
        focus(items.length - 1);
        break;
      case 'ArrowRight':
      case 'ArrowLeft': {
        const el = items[idx];
        const folderId = el?.getAttribute('data-folder-id');
        if (!folderId) return;
        const folder = useShell.getState().core.folders[folderId];
        if (!folder) return;
        const wantOpen = e.key === 'ArrowRight';
        if (folder.collapsed === wantOpen)
          dispatch({ type: 'folder/update', id: folderId, patch: { collapsed: !wantOpen } });
        e.preventDefault();
        break;
      }
    }
  }, []);

  const pickerTarget = iconPickerFor ? (core.tabs[iconPickerFor] ?? core.folders[iconPickerFor]) : undefined;
  const pickerValue = pickerTarget ? ('emoji' in pickerTarget ? pickerTarget.emoji : null) : null;

  return (
    <aside
      ref={rootRef}
      className={`${styles.sidebar} ${floating ? styles.floating : ''} grain`}
      style={{ width }}
      aria-label={t('shell.sidebar.label')}
      data-testid="sidebar"
      data-floating={floating ? 'true' : 'false'}
    >
      <NavBar onToggleSidebar={onToggle} />
      <FavoritesGrid onDragStart={onPointerDown} dragging={!!dnd && dnd.item.type === 'tab'} />
      <div
        className={`${styles.scroll} ${slide === 'right' ? styles.slideRight : ''} ${slide === 'left' ? styles.slideLeft : ''}`}
        role="tree"
        aria-label={t('shortcut.group.tabs')}
        onWheel={onWheel}
        onKeyDown={onTreeKeyDown}
        key={core.activeSpaceId}
        data-flip-viewport=""
      >
        <SpaceHeader />
        <PinnedList onDragStart={onPointerDown} />
        <TodayList onDragStart={onPointerDown} />
      </div>
      <SpaceBar />
      {iconPickerFor && pickerTarget && (
        <div className={styles.pickerAnchor}>
          <EmojiPicker
            value={pickerValue}
            onClose={() => setIconPickerFor(null)}
            onPick={(emoji) => {
              if (core.tabs[iconPickerFor])
                dispatch({ type: 'tab/update', id: iconPickerFor, patch: { emoji } });
              else dispatch({ type: 'folder/update', id: iconPickerFor, patch: { emoji } });
              setIconPickerFor(null);
            }}
          />
        </div>
      )}
      <DndLayer dnd={dnd} />
    </aside>
  );
}
