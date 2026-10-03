/**
 * @file lifecycle web provider — the page's `visibilitychange`, through the shared visibility
 * source. No peer, no permission. SSR (no `document`): no listener, and dispose is a no-op.
 */
import type { LifecycleProvider, LifecycleSignal } from "./types";
import { watchVisibility } from "./visibility";

/**
 * Create the web lifecycle provider: hidden → "pause", visible → "resume"; a page hidden at
 * creation reports "pause" once. dispose removes the listener.
 *
 * @param {LifecycleSignal} signal - Where each phase goes (createSignal dedupes).
 * @returns {Promise<LifecycleProvider>} The visibility-backed provider.
 * @example
 * ```ts
 * const provider = await createWebLifecycleProvider(phase => phases.push(phase)); // tab hidden → ["pause"]
 * await provider.dispose(); // later tab switches report nothing
 * ```
 */
export async function createWebLifecycleProvider(
  signal: LifecycleSignal
): Promise<LifecycleProvider> {
  const stopWatching = watchVisibility(signal);

  return {
    /**
     * Teardown — removes the `visibilitychange` listener. Idempotent; a no-op under SSR.
     *
     * @returns {Promise<void>} Resolves once the listener is gone.
     * @example
     * ```ts
     * await provider.dispose(); // hiding the tab no longer reports "pause"
     * ```
     */
    dispose: async (): Promise<void> => stopWatching()
  };
}
