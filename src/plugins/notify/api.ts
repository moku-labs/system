/**
 * @file notify plugin — API factory skeleton. Every method awaits the resolution slot
 * and returns SystemResult.
 */
import type { NotifyApi, NotifyContext } from "./types";

/**
 * Creates the notify API surface mounted at app.notify.
 *
 * @param {NotifyContext} _ctx - Notify domain context.
 * @example
 * ```ts
 * const api = createNotifyApi(ctx);
 * ```
 */
export function createNotifyApi(_ctx: NotifyContext): NotifyApi {
  throw new Error("not implemented");
}
