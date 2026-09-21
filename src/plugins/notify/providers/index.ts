/**
 * @file notify providers — resolver. Selection branches once on ctx.runtime.kind (D-012);
 * construction is delegated to ./tauri and ./web. Only ./web is statically imported:
 * ./tauri is reached through a dynamic `import()` inside the load closure, so the
 * `@tauri-apps/plugin-notification` specifier stays in a code-split chunk a pure-web
 * bundle never has to resolve.
 */
import { requirePeer } from "../../runtime/provider";
import type { NotifyContext } from "../types";
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
 * startResolution(ctx.runtime.kind, ctx, loadNotifyProvider(ctx));
 * ```
 */
export function loadNotifyProvider(ctx: NotifyContext): () => Promise<NotifyProvider> {
  if (ctx.runtime.kind === "tauri") {
    return requirePeer("notification", "@tauri-apps/plugin-notification", async () => {
      const { createTauriNotifyProvider } = await import("./tauri");
      return createTauriNotifyProvider(ctx.log);
    });
  }
  return () => createWebNotifyProvider(ctx.log);
}
