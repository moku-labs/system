/**
 * @file clipboard providers — resolver. Selection branches once on ctx.runtime.kind
 * inside the returned load closure (D-012); construction is delegated to ./tauri and ./web.
 */
import type { ClipboardContext } from "../types";
import { createTauriClipboardProvider } from "./tauri";
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
    return () => createTauriClipboardProvider(ctx.log);
  }
  return () => createWebClipboardProvider(ctx.log);
}
