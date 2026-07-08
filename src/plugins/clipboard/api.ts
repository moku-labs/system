/**
 * @file clipboard plugin — API factory skeleton. Every method awaits the resolution
 * slot and returns SystemResult.
 */
import type { ClipboardApi, ClipboardContext } from "./types";

/**
 * Creates the clipboard API surface mounted at app.clipboard.
 *
 * @param {ClipboardContext} _ctx - Clipboard domain context.
 * @example
 * ```ts
 * const api = createClipboardApi(ctx);
 * ```
 */
export function createClipboardApi(_ctx: ClipboardContext): ClipboardApi {
  throw new Error("not implemented");
}
