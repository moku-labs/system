/**
 * Complex tier — app lifecycle: onPause / onResume subscriptions fed by `visibilitychange`
 * (web) plus `tauri://suspended` / `tauri://resumed` (Tauri), deduped on transition.
 *
 * @see README.md
 */
import { createPlugin } from "../../config";
import { startResolution, stopResolution } from "../runtime/provider";
import { createLifecycleApi, createSignal } from "./api";
import { loadLifecycleProvider } from "./providers/index";
import { createLifecycleState } from "./state";

const PLUGIN_NAME = "lifecycle";

/**
 * Lifecycle capability plugin — pause/resume subscriptions behind the Tauri/web provider seam.
 * Imported from `@moku-labs/system/lifecycle` and composed via `createApp({ plugins })`;
 * emits no events.
 *
 * @see README.md
 */
export const lifecyclePlugin = createPlugin(PLUGIN_NAME, {
  createState: createLifecycleState,
  api: createLifecycleApi,
  /**
   * Start provider resolution — fire-and-forget. The provider wires its sources onto the signal:
   * the `visibilitychange` listener, and on Tauri the native suspend/resume listeners.
   *
   * @param {object} ctx - Plugin context; carries the detected runtime and the state slot.
   * @example
   * ```ts
   * await app.start(); // hiding the tab now calls the onPause subscribers
   * ```
   */
  onStart: ctx => {
    startResolution(ctx.runtime.kind, ctx, loadLifecycleProvider(ctx, createSignal(ctx)));
  },
  /**
   * Await the in-flight resolution, then dispose the provider — that removes every OS and DOM
   * listener `onStart` added, so no subscriber runs after `app.stop()`.
   *
   * @param {object} ctx - Plugin context carrying the resolution slot.
   * @returns {Promise<void>} Resolves once the listeners are gone.
   * @example
   * ```ts
   * await app.stop(); // hiding the tab no longer calls the onPause subscribers
   * ```
   */
  onStop: ctx => stopResolution(PLUGIN_NAME, ctx)
});
