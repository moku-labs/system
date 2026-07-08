/**
 * @file notify providers — resolver. Selection branches once on ctx.runtime.kind inside
 * the returned load closure (D-012); construction is delegated to ./tauri and ./web.
 */
import type { NotifyContext } from "../types";
import type { NotifyProvider } from "./types";

/**
 * Build the load closure passed to startResolution. kind "tauri" → Tauri notification
 * provider; otherwise → Web Notification API provider.
 *
 * @param {NotifyContext} _ctx - Notify domain context (runtime + log).
 * @example
 * ```ts
 * startResolution("notify", ctx.runtime.kind, ctx, loadNotifyProvider(ctx));
 * ```
 */
export function loadNotifyProvider(_ctx: NotifyContext): () => Promise<NotifyProvider> {
  throw new Error("not implemented");
}
