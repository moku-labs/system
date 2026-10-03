/**
 * @file keepAwake plugin — state factory. The resolution slot starts empty and onStart fills it
 * through startResolution. The wish and the held lock live in the provider, not here.
 */
import type { KeepAwakeState } from "./types";

/**
 * Creates the initial keepAwake state: an empty resolution slot that onStart fills.
 *
 * @returns The state with no provider yet.
 * @example
 * ```ts
 * createKeepAwakeState(); // { provider: null }
 * ```
 */
export function createKeepAwakeState(): KeepAwakeState {
  // eslint-disable-next-line unicorn/no-null -- ResolutionState.provider is null until onStart (seam contract)
  return { provider: null };
}
