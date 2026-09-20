/**
 * @file clipboard providers — resolver. Selection branches once on ctx.runtime.kind
 * inside the returned load closure (D-012); construction is delegated to ./tauri and
 * ./web. Only ./web is statically imported: ./tauri is reached through a dynamic
 * `import()`, so the `@tauri-apps/plugin-clipboard-manager` specifier stays in a
 * code-split chunk a pure-web bundle never has to resolve.
 */
import type { ClipboardContext } from "../types";
import type { ClipboardProvider } from "./types";
import { createWebClipboardProvider } from "./web";

/**
 * Build the load closure passed to startResolution. kind "tauri" → Tauri clipboard
 * provider; otherwise → navigator.clipboard provider.
 *
 * @param {ClipboardContext} ctx - Clipboard domain context (runtime + log).
 * @returns {() => Promise<ClipboardProvider>} The load closure for the selected provider.
 * @example
 * ```ts
 * startResolution("clipboard", ctx.runtime.kind, ctx, loadClipboardProvider(ctx));
 * ```
 */
export function loadClipboardProvider(ctx: ClipboardContext): () => Promise<ClipboardProvider> {
  if (ctx.runtime.kind === "tauri") {
    return async () => {
      const { createTauriClipboardProvider } = await import("./tauri");
      return createTauriClipboardProvider(ctx.log);
    };
  }
  return () => createWebClipboardProvider(ctx.log);
}
