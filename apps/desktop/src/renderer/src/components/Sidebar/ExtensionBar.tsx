import type { ExtensionInfo } from '@vela/shared';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
} from 'react';
import { invoke, vela } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { selectActivePartition, useShell } from '../../lib/store';
import { Icon } from '../Icon';
import styles from './ExtensionBar.module.css';

const TILE = 34;
const GAP = 6;

interface ActionState {
  activeTabId?: number;
  actions: BrowserActionInfo[];
}

const iconUrl = (id: string, partition: string): string =>
  `crx://extension-icon/${id}/32/2?${new URLSearchParams({ tabId: '-1', partition }).toString()}`;

function useExtensions(): ExtensionInfo[] {
  const [list, setList] = useState<ExtensionInfo[]>([]);
  useEffect(() => {
    // A change pushed before the initial answer is newer: the answer must not overwrite it.
    let pushed = false;
    void invoke('extensions/list', undefined).then(
      (initial) => {
        if (!pushed) setList(initial);
      },
      () => undefined,
    );
    return vela.on('extensions/changed', (next) => {
      pushed = true;
      setList(next);
    });
  }, []);
  return list;
}

/** electron-chrome-extensions' toolbar state for one session partition (icons, badges, titles). */
function useActionState(partition: string): ActionState {
  const [state, setState] = useState<ActionState>({ actions: [] });
  useEffect(() => {
    const api = window.browserAction;
    if (!api) return undefined;
    const onUpdate = (next: ActionState): void => setState(next);
    api.addEventListener('update', onUpdate);
    api.addObserver(partition);
    void api.getState(partition).then(onUpdate, () => undefined);
    return () => {
      api.removeEventListener('update', onUpdate);
      api.removeObserver(partition);
    };
  }, [partition]);
  return state;
}

/** One extension button: the library's `<button is="browser-action">` (icon, badge, popup) in a tile. */
function ActionTile({
  id,
  partition,
  tabId,
  label,
  onReorder,
}: {
  id: string;
  partition: string;
  tabId: number;
  label: string;
  onReorder: (from: string, to: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [over, setOver] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.setAttribute('partition', partition);
    // "right" makes the popup grow rightwards from the tile's left edge: the bar sits on the window's left.
    el.setAttribute('alignment', 'bottom right');
    el.setAttribute('tab', String(tabId));
    el.setAttribute('id', id);
  }, [id, partition, tabId]);
  return (
    <div
      className={`${styles.tile} no-drag`}
      data-over={over ? 'true' : undefined}
      draggable
      onDragStart={(e: DragEvent) => {
        e.dataTransfer.setData('application/x-vela-extension', id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('application/x-vela-extension')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const from = e.dataTransfer.getData('application/x-vela-extension');
        if (from && from !== id) onReorder(from, id);
      }}
      onContextMenuCapture={(e) => {
        // Ours replaces the library's menu: it adds "Unpin" and "Manage extensions".
        e.preventDefault();
        e.stopPropagation();
        void invoke('menu/show', { kind: 'extension', id, x: e.clientX, y: e.clientY });
      }}
      data-testid="extension-tile"
    >
      <button ref={ref} is="browser-action" className={styles.action} aria-label={label} title={label} />
    </div>
  );
}

function ExtensionsMenu({
  list,
  pins,
  partition,
  state,
  anchorRef,
  onClose,
}: {
  list: ExtensionInfo[];
  pins: string[];
  partition: string;
  state: ActionState;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node))
        onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [anchorRef, onClose]);

  const open = (ext: ExtensionInfo): void => {
    const api = window.browserAction;
    const r = anchorRef.current?.getBoundingClientRect();
    if (!api || !r || !ext.hasAction) return;
    api.activate(partition, {
      eventType: 'click',
      extensionId: ext.id,
      tabId: state.activeTabId ?? -1,
      alignment: 'bottom right',
      anchorRect: { x: r.left, y: r.top, width: r.width, height: r.height },
    });
    onClose();
  };
  const togglePin = (id: string): void => {
    const next = pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id];
    void invoke('prefs/set', { extensionPins: next });
  };

  return (
    <div
      ref={ref}
      className={styles.menu}
      role="dialog"
      aria-label={t('shell.extensions.all')}
      data-testid="extensions-menu"
    >
      <ul className={styles.list}>
        {list.map((ext) => {
          const pinned = pins.includes(ext.id);
          return (
            <li key={ext.id} className={styles.item}>
              <button
                className={styles.itemMain}
                onClick={() => open(ext)}
                disabled={!ext.hasAction}
                title={ext.hasAction ? ext.name : t('shell.extensions.noPopup')}
              >
                <img className={styles.itemIcon} src={iconUrl(ext.id, partition)} alt="" draggable={false} />
                <span className={styles.itemName}>{ext.name}</span>
              </button>
              {ext.hasAction && (
                <button
                  className={styles.pin}
                  aria-pressed={pinned}
                  aria-label={pinned ? t('shell.extensions.unpin') : t('shell.extensions.pin')}
                  title={pinned ? t('shell.extensions.unpin') : t('shell.extensions.pin')}
                  onClick={() => togglePin(ext.id)}
                  data-testid="extension-pin"
                >
                  <Icon name="pin" size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className={styles.foot}>
        <button
          className={styles.footLink}
          onClick={() => {
            void invoke('extensions/openStore', undefined);
            onClose();
          }}
        >
          <Icon name="puzzle" size={13} />
          {t('shell.extensions.store')}
        </button>
        <button
          className={styles.footLink}
          onClick={() => {
            void invoke('tab/openUrl', { input: 'vela://settings/#extensions', noAtc: true });
            onClose();
          }}
        >
          {t('shell.extensions.manage')}
        </button>
      </div>
    </div>
  );
}

/**
 * Pinned extensions as tiles between the URL field and the favorites, plus a puzzle tile that lists
 * every extension. Nothing is drawn until an extension with a button is installed.
 */
export function ExtensionBar() {
  const t = useT();
  const list = useExtensions();
  const pins = useShell((s) => s.prefs.extensionPins);
  const partition = useShell(selectActivePartition);
  const state = useActionState(partition);
  const barRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [capacity, setCapacity] = useState(5);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return undefined;
    const measure = (): void => {
      const width = el.clientWidth - 20;
      setCapacity(Math.max(0, Math.floor((width + GAP) / (TILE + GAP)) - 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [list.length]);

  const withButton = list.filter((e) => e.hasAction);
  if (withButton.length === 0) return null;
  const known = new Set(state.actions.map((a) => a.id));
  const byId = new Map(list.map((e) => [e.id, e]));
  const shown = pins.filter((id) => byId.get(id)?.hasAction && known.has(id)).slice(0, capacity);

  const reorder = (from: string, to: string): void => {
    const next = pins.filter((p) => p !== from);
    next.splice(next.indexOf(to), 0, from);
    void invoke('prefs/set', { extensionPins: next });
  };

  return (
    <div
      ref={barRef}
      className={styles.bar}
      role="toolbar"
      aria-label={t('shell.extensions.bar')}
      data-testid="extension-bar"
    >
      {shown.map((id) => (
        <ActionTile
          key={id}
          id={id}
          partition={partition}
          tabId={state.activeTabId ?? -1}
          label={byId.get(id)?.name ?? id}
          onReorder={reorder}
        />
      ))}
      <button
        ref={moreRef}
        className={`${styles.tile} ${styles.more} no-drag`}
        aria-label={t('shell.extensions.all')}
        title={t('shell.extensions.all')}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((o) => !o)}
        data-testid="extensions-more"
      >
        <Icon name="puzzle" size={16} />
      </button>
      {menuOpen && (
        <ExtensionsMenu
          list={list}
          pins={pins}
          partition={partition}
          state={state}
          anchorRef={moreRef}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
