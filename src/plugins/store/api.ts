/**
 * @file store plugin — API factory skeleton. Every method awaits the resolution slot
 * and returns SystemResult (see spec 02-store.md worked example).
 */
import type { StoreApi, StoreContext } from "./types";

/**
 * Creates the store API surface mounted at app.store.
 *
 * @param {StoreContext} _ctx - Store domain context.
 * @example
 * ```ts
 * const api = createStoreApi(ctx);
 * ```
 */
export function createStoreApi(_ctx: StoreContext): StoreApi {
  throw new Error("not implemented");
}
