/**
 * @file haptics providers — resolver. Selection is three-way, once, on ctx.runtime (D-012,
 * D-S05): kind "web" → the `navigator.vibrate` provider; kind "tauri" on iOS or Android →
 * the native plugin; kind "tauri" anywhere else → the shared unsupported stand-in (the
 * plugin does nothing on desktop, and the native registry row registers it on mobile only).
 * Only ./web is statically imported: ./tauri is reached through a dynamic `import()`, so the
 * `@tauri-apps/plugin-haptics` specifier stays in a chunk a pure-web bundle never resolves.
 */
import { requirePeer } from "../../runtime/provider";
import type { RuntimePlatform } from "../../runtime/result";
import { unsupportedProvider } from "../../runtime/result";
import type { HapticsContext } from "../types";
import type { HapticsProvider } from "./types";
import { HAPTICS_METHODS } from "./types";
import { createWebHapticsProvider } from "./web";

/**
 * The platforms where the native haptics plugin is registered. An allowlist, so an
 * unrecognized platform ("unknown") answers "unsupported" instead of importing the plugin.
 */
const HAPTIC_PLATFORMS = new Set<RuntimePlatform>(["ios", "android"]);

/**
 * Build the load closure passed to startResolution.
 *
 * @param ctx - Haptics domain context (runtime + log).
 * @returns The load closure for the selected provider.
 * @example
 * ```ts
 * // ctx.runtime is { kind: "tauri", platform: "macos" }: no native haptics, the stand-in answers.
 * const provider = await loadHapticsProvider(ctx)();
 * await provider.impact("light"); // { ok: false, provider: "tauri", reason: "unsupported" }
 * ```
 */
export function loadHapticsProvider(ctx: HapticsContext): () => Promise<HapticsProvider> {
  if (ctx.runtime.kind === "web") {
    return () => createWebHapticsProvider(ctx.log);
  }

  if (!HAPTIC_PLATFORMS.has(ctx.runtime.platform)) {
    return () => Promise.resolve(unsupportedProvider("tauri", HAPTICS_METHODS));
  }

  return requirePeer("haptics", "@tauri-apps/plugin-haptics", async () => {
    const { createTauriHapticsProvider } = await import("./tauri");
    return createTauriHapticsProvider(ctx.log);
  });
}
