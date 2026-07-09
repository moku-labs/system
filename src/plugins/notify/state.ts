/**
 * @file notify plugin — state factory. The resolution slot starts empty; onStart
 * populates it synchronously via startResolution (spec/02 §State).
 */
import type { NotifyState } from "./types";

/**
 * Creates the initial notify state: an empty resolution slot (provider: null) that
 * onStart populates via startResolution.
 *
 * @returns {NotifyState} The initial state with no resolved provider yet.
 * @example
 * ```ts
 * const state = createNotifyState(); // { provider: null }
 * ```
 */
export function createNotifyState(): NotifyState {
  // eslint-disable-next-line unicorn/no-null -- ResolutionState.provider is null until onStart (seam contract)
  return { provider: null };
}
