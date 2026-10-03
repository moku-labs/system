/**
 * Complex tier — hardware Back on Android; the native listener exists only while a
 * handler does (D-S04), so an app with no handler keeps the system Back.
 *
 * @see README.md
 */
import { createPlugin } from "../../config";
import { startResolution, stopResolution } from "../runtime/provider";
import { createBackApi, reconcile } from "./api";
import { loadBackProvider } from "./providers/index";
import { createBackState } from "./state";

const PLUGIN_NAME = "back";

/**
 * Back capability plugin — hardware Back press handlers and app exit behind the
 * Tauri/web provider seam. Tauri Android only; web and the other Tauri platforms keep
 * the handlers and answer `exit()` with `err("unsupported")`. Imported from
 * `@moku-labs/system/back`; emits no events.
 *
 * @see README.md
 */
export const backPlugin = createPlugin(PLUGIN_NAME, {
  createState: createBackState,
  api: createBackApi,
  /**
   * Start provider resolution — fire-and-forget, so a slow or failing `@tauri-apps/api`
   * load never blocks `app.start()` — then register the native listener when handlers
   * were added before start.
   *
   * @param {object} ctx - Plugin context; carries the detected runtime and the state slot.
   * @example
   * ```ts
   * await app.start(); // Android: the native Back listener follows the handlers from now on
   * ```
   */
  onStart: ctx => {
    startResolution(ctx.runtime.kind, ctx, loadBackProvider(ctx));
    reconcile(ctx);
  },
  /**
   * Await the in-flight resolution, then dispose the provider — that unregisters the
   * native Back listener and gives Back back to the system.
   *
   * @param {object} ctx - Plugin context carrying the resolution slot.
   * @returns {Promise<void>} Resolves once the provider is disposed.
   * @example
   * ```ts
   * await app.stop(); // Android: the system Back works again
   * ```
   */
  onStop: ctx => stopResolution(PLUGIN_NAME, ctx)
});
