/**
 * @file clipboard providers — resolver. Selection branches once on ctx.runtime.kind
 * inside the returned load closure (D-012); construction is delegated to ./tauri and ./web.
 */
import type { ClipboardContext } from "../types";
import type { ClipboardProvider } from "./types";

/**
 * Build the load closure passed to startResolution. kind "tauri" → Tauri clipboard
 * provider; otherwise → navigator.clipboard provider.
 *
 * @param {ClipboardContext} _ctx - Clipboard domain context (runtime + log).
 * @example
 * ```ts
 * startResolution("clipboard", ctx.runtime.kind, ctx, loadClipboardProvider(ctx));
 * ```
 */
export function loadClipboardProvider(_ctx: ClipboardContext): () => Promise<ClipboardProvider> {
  throw new Error("not implemented");
}
