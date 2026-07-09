/**
 * @file clipboard plugin — state factory. The resolution slot starts empty; onStart
 * populates it synchronously via startResolution (spec/05 §State).
 */
import type { ClipboardState } from "./types";

/**
 * Creates the initial clipboard state: an empty resolution slot (provider: null) that
 * onStart populates via startResolution.
 *
 * @returns {ClipboardState} The initial state with no resolved provider yet.
 * @example
 * ```ts
 * const state = createClipboardState(); // { provider: null }
 * ```
 */
export function createClipboardState(): ClipboardState {
  // eslint-disable-next-line unicorn/no-null -- ResolutionState.provider is null until onStart (seam contract)
  return { provider: null };
}
