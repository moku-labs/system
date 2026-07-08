/**
 * @file tray plugin — API factory skeleton. Every method awaits the resolution slot
 * and returns SystemResult.
 */
import type { TrayApi, TrayContext } from "./types";

/**
 * Creates the tray API surface mounted at app.tray.
 *
 * @param {TrayContext} _ctx - Tray domain context.
 * @example
 * ```ts
 * const api = createTrayApi(ctx);
 * ```
 */
export function createTrayApi(_ctx: TrayContext): TrayApi {
  throw new Error("not implemented");
}
