/**
 * @file notify providers — resolver. Selection branches once on ctx.runtime.kind (D-012);
 * construction is delegated to ./tauri and ./web. Both are statically imported (SSR-safe);
 * the lazy boundary that matters is inside tauri.ts's dynamic `@tauri-apps/plugin-notification`
 * import.
 */
import type { NotifyContext } from "../types";
import { createTauriNotifyProvider } from "./tauri";
import type { NotifyProvider } from "./types";
import { createWebNotifyProvider } from "./web";

/**
 * Build the load closure passed to startResolution. kind "tauri" → Tauri notification
 * provider; otherwise → Web Notification API provider.
 *
 * @param {NotifyContext} ctx - Notify domain context (runtime + log).
 * @returns {() => Promise<NotifyProvider>} The load closure for the selected provider.
 * @example
 * ```ts
 * startResolution("notify", ctx.runtime.kind, ctx, loadNotifyProvider(ctx));
 * ```
 */
export function loadNotifyProvider(ctx: NotifyContext): () => Promise<NotifyProvider> {
  if (ctx.runtime.kind === "tauri") {
    return () => createTauriNotifyProvider(ctx.log);
  }
  return () => createWebNotifyProvider(ctx.log);
}
