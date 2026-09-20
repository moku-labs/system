/**
 * @file store providers — resolver. Selection branches once on ctx.runtime.kind (D-012);
 * construction is delegated to ./tauri and ./web. Only ./web is statically imported:
 * ./tauri is reached through a dynamic `import()` inside the load closure, so the
 * `@tauri-apps/plugin-store` specifier stays in a code-split chunk a pure-web bundle
 * never has to resolve.
 */
import { requirePeer } from "../../runtime/provider";
import type { StoreContext } from "../types";
import type { StoreProvider } from "./types";
import { createWebStoreProvider } from "./web";

/**
 * Build the load closure passed to startResolution. kind "tauri" → Tauri store file
 * provider; otherwise → IndexedDB provider.
 *
 * @param {StoreContext} ctx - Store domain context (config + runtime + log).
 * @returns {() => Promise<StoreProvider>} The load closure for the selected provider.
 * @example
 * ```ts
 * startResolution("store", ctx.runtime.kind, ctx, loadStoreProvider(ctx));
 * ```
 */
export function loadStoreProvider(ctx: StoreContext): () => Promise<StoreProvider> {
  if (ctx.runtime.kind === "tauri") {
    return requirePeer("store", "@tauri-apps/plugin-store", async () => {
      const { createTauriStoreProvider } = await import("./tauri");
      return createTauriStoreProvider(ctx.config, ctx.log);
    });
  }
  return () => createWebStoreProvider(ctx.config, ctx.log);
}
