/**
 * @file store plugin — state factory. The resolution slot starts empty; onStart
 * populates it synchronously via startResolution (spec/02 §State).
 */
import type { StoreState } from "./types";

/**
 * Creates the initial store state: an empty resolution slot (provider: null) that
 * onStart populates via startResolution.
 *
 * @returns {StoreState} The initial state with no resolved provider yet.
 * @example
 * ```ts
 * const state = createStoreState(); // { provider: null }
 * ```
 */
export function createStoreState(): StoreState {
  // eslint-disable-next-line unicorn/no-null -- ResolutionState.provider is null until onStart (seam contract)
  return { provider: null };
}
