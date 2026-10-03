/**
 * @file lifecycle plugin — state factory. The resolution slot starts empty; onStart populates it
 * synchronously via startResolution (spec/06 §3). The app starts in the foreground
 * (`paused: false`), so the first transition a source can report is a pause.
 */
import type { LifecycleState } from "./types";

/**
 * Creates the initial lifecycle state: an empty resolution slot, `paused: false` and two empty
 * subscriber sets.
 *
 * @returns {LifecycleState} The initial state, before any provider or subscriber.
 * @example
 * ```ts
 * const state = createLifecycleState(); // { provider: null, paused: false, pauseSubscribers: Set(0), resumeSubscribers: Set(0) }
 * ```
 */
export function createLifecycleState(): LifecycleState {
  return {
    // eslint-disable-next-line unicorn/no-null -- ResolutionState.provider is null until onStart (seam contract)
    provider: null,
    paused: false,
    pauseSubscribers: new Set(),
    resumeSubscribers: new Set()
  };
}
