/**
 * @file back plugin — state factory. The resolution slot starts empty; onStart
 * populates it synchronously via startResolution (spec/02 §State). The handler stack
 * starts empty, so no native listener is wanted until the first `onPress` (D-S04).
 */
import type { BackState } from "./types";

/**
 * Creates the initial back state: an empty resolution slot that onStart fills, no
 * handlers, no native listener, and an idle reconcile queue.
 *
 * @returns {BackState} The initial state with no resolved provider yet.
 * @example
 * ```ts
 * const state = createBackState(); // { provider: null, handlers: [], listening: false, queue: resolved }
 * ```
 */
export function createBackState(): BackState {
  return {
    // eslint-disable-next-line unicorn/no-null -- ResolutionState.provider is null until onStart (seam contract)
    provider: null,
    handlers: [],
    listening: false,
    queue: Promise.resolve()
  };
}
