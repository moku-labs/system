/**
 * @file tray providers — resolver. Selection is THREE-WAY (D-012 extended by platform
 * gating): kind "web" → the all-unsupported-by-kind web provider; kind "tauri" with
 * platform "ios"/"android" → the all-unsupported-by-platform-within-kind stand-in;
 * kind "tauri" desktop/unknown → the real Tauri provider. BOTH absence branches route
 * through the shared `unsupportedProvider()` factory (one via `./web`, one inline) —
 * never a hand-written all-unsupported object.
 */
import { unsupportedProvider } from "../../runtime/result";
import type { TrayContext } from "../types";
import { createTauriTrayProvider } from "./tauri";
import type { TrayProvider } from "./types";
import { TRAY_METHODS } from "./types";
import { createWebTrayProvider } from "./web";

/**
 * Build the load closure passed to startResolution. Selection branches once on
 * ctx.runtime (D-012); construction is delegated to ./tauri and ./web.
 *
 * @param {TrayContext} ctx - Tray domain context (config + runtime + log).
 * @returns {() => Promise<TrayProvider>} The load closure for the selected provider.
 * @example
 * ```ts
 * startResolution("tray", ctx.runtime.kind, ctx, loadTrayProvider(ctx));
 * ```
 */
export function loadTrayProvider(ctx: TrayContext): () => Promise<TrayProvider> {
  if (ctx.runtime.kind === "web") {
    return () => Promise.resolve(createWebTrayProvider());
  }
  if (ctx.runtime.platform === "ios" || ctx.runtime.platform === "android") {
    return () => Promise.resolve(unsupportedProvider("tauri", TRAY_METHODS));
  }
  return () => createTauriTrayProvider(ctx.config, ctx.log);
}
