/**
 * Complex tier — screen keep-awake over the Screen Wake Lock API. One provider serves web and
 * Tauri (D-S03). No config, no events.
 *
 * @see README.md
 */
import { createPlugin } from "../../config";
import { startResolution, stopResolution } from "../runtime/provider";
import { createKeepAwakeApi } from "./api";
import { loadKeepAwakeProvider } from "./providers/index";
import { createKeepAwakeState } from "./state";

const PLUGIN_NAME = "keepAwake";

/**
 * Keep-awake capability plugin — holds the screen on through `navigator.wakeLock`, in a browser
 * and inside the Tauri webview alike. Imported from `@moku-labs/system/keep-awake`; emits no
 * events.
 *
 * @see README.md
 */
export const keepAwakePlugin = createPlugin(PLUGIN_NAME, {
  createState: createKeepAwakeState,
  api: createKeepAwakeApi,
  /**
   * Starts provider resolution. Fire-and-forget, so `app.start()` never waits on the provider.
   *
   * @param ctx - Plugin context; carries the detected runtime and the state slot.
   * @example
   * ```ts
   * await app.start(); // keepAwake provider resolution begins here
   * ```
   */
  onStart: ctx => {
    startResolution(ctx.runtime.kind, ctx, loadKeepAwakeProvider(ctx));
  },
  /**
   * Awaits the in-flight resolution, then disposes the provider: that releases the lock and
   * removes the visibility listener.
   *
   * @param ctx - Plugin context carrying the resolution slot.
   * @returns Resolves once the lock is released.
   * @example
   * ```ts
   * await app.stop(); // the screen may sleep again
   * ```
   */
  onStop: ctx => stopResolution(PLUGIN_NAME, ctx)
});
