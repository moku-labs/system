/**
 * Complex tier — OS/browser notifications (core trio; explicit permission flow, show()
 * never auto-prompts).
 *
 * @see README.md
 */
import { createPlugin } from "../../config";
import { startResolution, stopResolution } from "../runtime/provider";
import { createNotifyApi } from "./api";
import { loadNotifyProvider } from "./providers/index";
import { createNotifyState } from "./state";

const PLUGIN_NAME = "notify";

/**
 * Notification capability plugin — explicit permission flow behind the Tauri/web provider
 * seam. Imported from `@moku-labs/system/notify` and composed via `createApp({ plugins })`.
 *
 * @see README.md
 */
export const notifyPlugin = createPlugin(PLUGIN_NAME, {
  createState: createNotifyState,
  api: createNotifyApi,
  /**
   * Start provider resolution — fire-and-forget, so a slow or failing `@tauri-apps/*`
   * load never blocks `app.start()`; the failure folds into the next call's result.
   *
   * @param {object} ctx - Plugin context; carries the detected runtime and the state slot.
   * @example
   * ```ts
   * await app.start(); // notify provider resolution begins here
   * ```
   */
  onStart: ctx => {
    startResolution(ctx.runtime.kind, ctx, loadNotifyProvider(ctx));
  },
  /**
   * Await the in-flight resolution, then dispose the provider — the resource `onStart` opened.
   *
   * @param {object} ctx - Plugin context carrying the resolution slot.
   * @returns {Promise<void>} Resolves once the provider is disposed.
   * @example
   * ```ts
   * await app.stop(); // resolution awaited, provider disposed
   * ```
   */
  onStop: ctx => stopResolution(PLUGIN_NAME, ctx)
});
