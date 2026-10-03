/**
 * @file back providers — resolver. Selection is THREE-WAY, once, on ctx.runtime (D-012,
 * D-S05): kind "web" → the all-unsupported web provider; kind "tauri" on any platform but
 * android → the all-unsupported stand-in (the native registry row grants
 * `core:app:allow-exit` on Android only, and Apple discourages a programmatic exit);
 * kind "tauri" on android → the real provider, reached through a dynamic `import()` so
 * the `@tauri-apps/api` specifier stays in a code-split chunk a pure-web bundle never has
 * to resolve. BOTH absence branches route through the shared `unsupportedProvider()`.
 */
import { requirePeer } from "../../runtime/provider";
import { unsupportedProvider } from "../../runtime/result";
import type { BackContext } from "../types";
import type { BackProvider } from "./types";
import { BACK_METHODS } from "./types";
import { createWebBackProvider } from "./web";

/**
 * Build the load closure passed to startResolution. Selection branches once on
 * ctx.runtime (D-012); construction is delegated to ./tauri and ./web. A missing
 * `@tauri-apps/api` fails with a message that names the package and the `back` row of
 * `@moku-labs/native` `config.system`.
 *
 * @param {BackContext} ctx - Back domain context (runtime + log).
 * @returns {() => Promise<BackProvider>} The load closure for the selected provider.
 * @example
 * ```ts
 * // ctx.runtime is { kind: "tauri", platform: "android" }: the real provider loads.
 * const provider = await loadBackProvider(ctx)();
 * await provider.listen(() => true); // { ok: true, value: undefined, provider: "tauri" }
 * ```
 */
export function loadBackProvider(ctx: BackContext): () => Promise<BackProvider> {
  if (ctx.runtime.kind === "web") {
    return () => Promise.resolve(createWebBackProvider());
  }
  if (ctx.runtime.platform !== "android") {
    return () => Promise.resolve(unsupportedProvider("tauri", BACK_METHODS));
  }
  return requirePeer("back", "@tauri-apps/api", async () => {
    const { createTauriBackProvider } = await import("./tauri");
    return createTauriBackProvider(ctx.log);
  });
}
