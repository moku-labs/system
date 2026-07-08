/**
 * @file tray providers — resolver. Selection branches once on ctx.runtime inside the
 * returned load closure (D-012); construction is delegated to ./tauri and ./web.
 */
import type { TrayContext } from "../types";
import type { TrayProvider } from "./types";

/**
 * Build the load closure passed to startResolution. THREE-WAY selection: kind "web" →
 * unsupportedProvider; kind "tauri" + platform "ios"/"android" → unsupportedProvider
 * (platform-gated); kind "tauri" desktop → createTauriTrayProvider.
 *
 * @param {TrayContext} _ctx - Tray domain context (config + runtime + log).
 * @example
 * ```ts
 * startResolution("tray", ctx.runtime.kind, ctx, loadTrayProvider(ctx));
 * ```
 */
export function loadTrayProvider(_ctx: TrayContext): () => Promise<TrayProvider> {
  throw new Error("not implemented");
}
