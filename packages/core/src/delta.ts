import type { CoreAction } from './actions';
import { reduce } from './reducer';
import type { CoreState } from './types';

/**
 * What main broadcasts after each batch of dispatches. Renderers replay the actions through the
 * same pure reducer, so a title tick costs a few bytes instead of the whole state. Actions that
 * depend on the archive (which renderers do not hold, D016) and full replacements come as a
 * snapshot instead.
 */
export type StateDelta =
  | { kind: 'actions'; fromRev: number; rev: number; actions: CoreAction[] }
  | { kind: 'snapshot'; rev: number; state: CoreState };

/** Actions whose result cannot be reproduced without the archive. */
export function needsSnapshot(action: CoreAction): boolean {
  return action.type.startsWith('archive/') || action.type === 'state/replace';
}

export type ApplyResult = { state: CoreState; rev: number } | { resync: true };

/** Applies a delta to a renderer's copy; `resync` means a message was missed and a fresh snapshot is needed. */
export function applyDelta(state: CoreState, rev: number, delta: StateDelta): ApplyResult {
  if (delta.kind === 'snapshot') return { state: delta.state, rev: delta.rev };
  if (delta.fromRev !== rev) return { resync: true };
  let next = state;
  for (const action of delta.actions) next = reduce(next, action);
  // Renderers never accumulate archive entries (served on demand by main).
  if (next.archive.length > 0) next = { ...next, archive: [] };
  return { state: next, rev: delta.rev };
}
