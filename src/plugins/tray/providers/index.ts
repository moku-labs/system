/**
 * @file tray providers — resolver. Selection is THREE-WAY (D-012 extended by platform
 * gating): kind "web" → the all-unsupported-by-kind web provider; kind "tauri" on any
 * platform outside the desktop allowlist → the all-unsupported-by-platform-within-kind
 * stand-in; kind "tauri" on macos/windows/linux → the real Tauri provider, reached
 * through a dynamic `import()` so the `@tauri-apps/api` specifiers stay in a code-split
 * chunk a pure-web bundle never has to resolve. BOTH absence branches route through the
 * shared `unsupportedProvider()` factory (one via `./web`, one inline) — never a
 * hand-written all-unsupported object.
 */
import type { RuntimePlatform } from "../../runtime/result";
import { unsupportedProvider } from "../../runtime/result";
import type { TrayContext } from "../types";
import type { TrayProvider } from "./types";
import { TRAY_METHODS } from "./types";
import { createWebTrayProvider } from "./web";

/**
 * The platforms that actually have a desktop tray. An ALLOWLIST, not a mobile denylist:
 * an unrecognized platform ("unknown") must degrade to a typed "unsupported", never fall
 * into the desktop provider and fail at call time.
 */
const DESKTOP_PLATFORMS = new Set<RuntimePlatform>(["macos", "windows", "linux"]);

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
  if (!DESKTOP_PLATFORMS.has(ctx.runtime.platform)) {
    return () => Promise.resolve(unsupportedProvider("tauri", TRAY_METHODS));
  }
  return async () => {
    const { createTauriTrayProvider } = await import("./tauri");
    return createTauriTrayProvider(ctx.config, ctx.log);
  };
}
