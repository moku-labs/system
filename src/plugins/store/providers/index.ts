/**
 * @file store providers — resolver. Selection branches once on ctx.runtime.kind inside
 * the returned load closure (D-012); construction is delegated to ./tauri and ./web.
 */
import type { StoreContext } from "../types";
import type { StoreProvider } from "./types";

/**
 * Build the load closure passed to startResolution. kind "tauri" → Tauri store file
 * provider; otherwise → IndexedDB provider.
 *
 * @param {StoreContext} _ctx - Store domain context (config + runtime + log).
 * @example
 * ```ts
 * startResolution("store", ctx.runtime.kind, ctx, loadStoreProvider(ctx));
 * ```
 */
export function loadStoreProvider(_ctx: StoreContext): () => Promise<StoreProvider> {
  throw new Error("not implemented");
}
