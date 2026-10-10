import { reduce, type CoreAction, type CoreState } from '@vela/core';

export type StoreListener = (next: CoreState, prev: CoreState, action: CoreAction) => void;

/** Single source of truth for spaces/tabs. Main process only. */
export class Store {
  private listeners = new Set<StoreListener>();

  constructor(public state: CoreState) {}

  dispatch(action: CoreAction): CoreState {
    const prev = this.state;
    const next = reduce(prev, action);
    if (next === prev) return prev;
    this.state = next;
    for (const l of this.listeners) l(next, prev, action);
    return next;
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
