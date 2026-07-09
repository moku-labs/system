/**
 * @file tray plugin — state factory. The resolution slot starts empty; onStart
 * populates it synchronously via startResolution (spec/02 §State). The lazy OS icon
 * handle lives inside the Tauri provider closure, not here.
 */
import type { TrayState } from "./types";

/**
 * Creates the initial tray state: an empty resolution slot (provider: null) that
 * onStart populates via startResolution.
 *
 * @returns {TrayState} The initial state with no resolved provider yet.
 * @example
 * ```ts
 * const state = createTrayState(); // { provider: null }
 * ```
 */
export function createTrayState(): TrayState {
  // eslint-disable-next-line unicorn/no-null -- ResolutionState.provider is null until onStart (seam contract)
  return { provider: null };
}
