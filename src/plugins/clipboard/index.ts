/**
 * Complex tier — clipboard text access (core trio; feature-probed, NotAllowedError →
 * typed "denied").
 *
 * @see README.md
 */
import { createPlugin } from "../../config";
import { startResolution, stopResolution } from "../runtime/provider";
import { createClipboardApi } from "./api";
import { loadClipboardProvider } from "./providers/index";
import { createClipboardState } from "./state";

const PLUGIN_NAME = "clipboard";

/**
 * Clipboard capability plugin — text read/write behind the Tauri/web provider seam.
 * Imported from `@moku-labs/system/clipboard` and composed via `createApp({ plugins })`.
 *
 * @see README.md
 */
export const clipboardPlugin = createPlugin(PLUGIN_NAME, {
  createState: createClipboardState,
  api: createClipboardApi,
  /**
   * Start provider resolution — fire-and-forget, so a slow or failing `@tauri-apps/*`
   * load never blocks `app.start()`; the failure folds into the next call's result.
   *
   * @param {object} ctx - Plugin context; carries the detected runtime and the state slot.
   * @example
   * ```ts
   * await app.start(); // clipboard provider resolution begins here
   * ```
   */
  onStart: ctx => {
    startResolution(ctx.runtime.kind, ctx, loadClipboardProvider(ctx));
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
