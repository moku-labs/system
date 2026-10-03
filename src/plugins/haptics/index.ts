/**
 * Complex tier — haptic feedback: an impact tap, an outcome pattern, a selection tick.
 * Tauri iOS and Android play the native haptic, a browser plays a `navigator.vibrate`
 * pattern, everything else answers a typed "unsupported". No config, no events.
 *
 * @see README.md
 */
import { createPlugin } from "../../config";
import { startResolution, stopResolution } from "../runtime/provider";
import { createHapticsApi } from "./api";
import { loadHapticsProvider } from "./providers/index";
import { createHapticsState } from "./state";

const PLUGIN_NAME = "haptics";

/**
 * Haptics capability plugin — impact, notify and selection feedback behind the Tauri/web
 * provider seam. Imported from `@moku-labs/system/haptics` and composed via
 * `createApp({ plugins: [hapticsPlugin] })`.
 *
 * @see README.md
 */
export const hapticsPlugin = createPlugin(PLUGIN_NAME, {
  createState: createHapticsState,
  api: createHapticsApi,
  /**
   * Start provider resolution without awaiting it, so a slow or missing
   * `@tauri-apps/plugin-haptics` never blocks `app.start()`.
   *
   * @param ctx - Plugin context: the detected runtime and the resolution slot.
   * @example
   * ```ts
   * await app.start(); // haptics provider resolution begins here
   * ```
   */
  onStart: ctx => {
    startResolution(ctx.runtime.kind, ctx, loadHapticsProvider(ctx));
  },
  /**
   * Wait for an in-flight resolution, then dispose the provider.
   *
   * @param ctx - Teardown context carrying the resolution slot.
   * @returns Resolves once the provider is disposed.
   * @example
   * ```ts
   * await app.stop(); // resolution awaited, provider disposed
   * ```
   */
  onStop: ctx => stopResolution(PLUGIN_NAME, ctx)
});
