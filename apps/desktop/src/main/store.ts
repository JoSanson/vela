import { reduce, type CoreAction, type CoreState } from '@vela/core';

export type StoreListener = (next: CoreState, prev: CoreState, action: CoreAction) => void;
export type AppliedListener = (next: CoreState, action: CoreAction) => void;

/** Single source of truth for spaces/tabs. Main process only. */
export class Store {
  private listeners = new Set<StoreListener>();
  private applied = new Set<AppliedListener>();
  /** Monotonic count of applied actions; renderers use it to detect a missed delta. */
  rev = 0;

  constructor(public state: CoreState) {}

  dispatch(action: CoreAction): CoreState {
    const prev = this.state;
    const next = reduce(prev, action);
    if (next === prev) return prev;
    this.state = next;
    this.rev++;
    for (const l of this.applied) l(next, action);
    for (const l of this.listeners) {
      try {
        l(next, prev, action);
      } catch (err) {
        console.error('[store] listener failed for', action.type, err);
      }
    }
    return next;
  }

  /**
   * Called right after each reduction, before subscribers run. A subscriber may dispatch (nested);
   * subscribers then see the nested action first, but this hook always sees reduction order, which
   * is what renderers must replay.
   */
  onApplied(listener: AppliedListener): () => void {
    this.applied.add(listener);
    return () => this.applied.delete(listener);
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
