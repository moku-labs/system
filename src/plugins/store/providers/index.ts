/**
 * @file store providers — resolver. Selection branches once on ctx.runtime.kind (D-012);
 * construction is delegated to ./tauri and ./web. Both are statically imported (SSR-safe);
 * the lazy boundary that matters is inside tauri.ts's dynamic `@tauri-apps/plugin-store` import.
 */
import type { StoreContext } from "../types";
import { createTauriStoreProvider } from "./tauri";
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
    return () => createTauriStoreProvider(ctx.config, ctx.log);
  }
  return () => createWebStoreProvider(ctx.config, ctx.log);
}
