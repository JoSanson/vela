import { createTab, visibleTabIds, type Id } from '@vela/core';
import type { AppContext } from '../context';

type Ctx = Pick<AppContext, 'store' | 'windows'>;

/** This window's own page for a favorite or pinned tab, created (not shown) when it has none yet. */
function shadowFor(ctx: Ctx, tabId: Id, spaceId: Id): Id | null {
  const { store } = ctx;
  const state = store.state;
  const tab = state.tabs[tabId];
  if (!tab) return null;
  const existing = Object.values(state.tabs).find((t) => t.shadowOf === tabId && t.spaceId === spaceId);
  if (existing) return existing.id;
  const page = {
    ...createTab({ url: tab.url, spaceId, kind: 'today', title: tab.title, now: Date.now() }),
    favicon: tab.favicon,
    shadowOf: tabId,
  };
  store.dispatch({ type: 'tab/open', tab: page, activate: false });
  return store.state.tabs[page.id] ? page.id : null;
}

function shownElsewhere(ctx: Ctx, tabId: Id, spaceId: Id): boolean {
  const state = ctx.store.state;
  return ctx.windows
    .all()
    .some((mw) => mw.spaceId !== spaceId && visibleTabIds(state, mw.spaceId).includes(tabId));
}

/**
 * Shows a tab in the window whose Space is `spaceId`. A favorite or pinned tab already on screen in
 * another window gets a page of its own here (a shadow), as Arc keeps one web contents per window
 * and sidebar item; coming back to it in this window finds that same page again.
 */
export function activateInWindow(ctx: Ctx, tabId: Id, spaceId: Id): void {
  const { store } = ctx;
  const tab = store.state.tabs[tabId];
  const now = Date.now();
  if (!tab) return;
  const hasShadow = Object.values(store.state.tabs).some(
    (t) => t.shadowOf === tabId && t.spaceId === spaceId,
  );
  const id =
    tab.kind === 'today' || tab.shadowOf || (!hasShadow && !shownElsewhere(ctx, tabId, spaceId))
      ? tabId
      : (shadowFor(ctx, tabId, spaceId) ?? tabId);
  store.dispatch({ type: 'tab/activate', id, now, spaceId });
}

/**
 * A native view has one parent: when two windows end up showing the same favorite or pinned tab
 * (a window coming back to a Space, a fallback pick after a close), the window that is not in front
 * switches to its own page for it.
 */
export function settleSharedTabs(ctx: Ctx): void {
  const { store, windows } = ctx;
  const front = windows.main;
  const ordered = front ? [front, ...windows.all().filter((w) => w !== front)] : windows.all();
  const taken = new Set<Id>();
  for (const mw of ordered) {
    const state = store.state;
    const space = state.spaces[mw.spaceId];
    if (!space) continue;
    for (const id of visibleTabIds(state, mw.spaceId)) {
      if (!taken.has(id)) {
        taken.add(id);
        continue;
      }
      const tab = state.tabs[id];
      if (!tab || tab.kind === 'today' || tab.shadowOf) continue;
      const shadow = shadowFor(ctx, id, mw.spaceId);
      if (!shadow) continue;
      const split = store.state.spaces[mw.spaceId]?.split;
      if (split?.panes.includes(id)) {
        store.dispatch({
          type: 'split/set',
          spaceId: mw.spaceId,
          layout: { panes: split.panes.map((p) => (p === id ? shadow : p)), sizes: split.sizes },
        });
      } else {
        store.dispatch({ type: 'space/setActiveTab', spaceId: mw.spaceId, tabId: shadow });
      }
      taken.add(shadow);
    }
  }
}
