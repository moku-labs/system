/**
 * @file haptics plugin — state factory. Only the resolution slot; onStart fills it through
 * startResolution (spec/05 §State).
 */
import type { HapticsState } from "./types";

/**
 * Create the initial haptics state: an empty resolution slot (provider: null) that onStart
 * fills through startResolution.
 *
 * @returns The state with no provider yet.
 * @example
 * ```ts
 * createHapticsState(); // { provider: null }
 * ```
 */
export function createHapticsState(): HapticsState {
  // eslint-disable-next-line unicorn/no-null -- ResolutionState.provider is null until onStart (seam contract)
  return { provider: null };
}
