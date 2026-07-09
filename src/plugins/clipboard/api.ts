/**
 * @file clipboard plugin — API factory. Every method awaits the resolution slot
 * and returns SystemResult (see spec 05-clipboard.md worked example).
 */
import { awaitProvider } from "../runtime/provider";
import type { SystemResult } from "../runtime/result";
import type { ClipboardApi, ClipboardContext } from "./types";

/**
 * Creates the clipboard API surface mounted at app.clipboard.
 *
 * @param {ClipboardContext} ctx - Clipboard domain context (state + runtime + log).
 * @returns {ClipboardApi} The clipboard API surface.
 * @example
 * ```ts
 * const api = createClipboardApi(ctx);
 * ```
 */
export function createClipboardApi(ctx: ClipboardContext): ClipboardApi {
  return {
    /**
     * Read the current clipboard text.
     *
     * @returns {Promise<SystemResult<string>>} Clipboard contents or a typed failure.
     * @example
     * ```ts
     * const r = await api.readText();
     * ```
     */
    readText: async (): Promise<SystemResult<string>> => {
      const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
      if (!resolved.ok) {
        return resolved.failure;
      }
      return resolved.provider.readText();
    },

    /**
     * Write text to the clipboard.
     *
     * @param {string} text - Text to write.
     * @returns {Promise<SystemResult<void>>} ok when written.
     * @example
     * ```ts
     * const r = await api.writeText("copy me");
     * ```
     */
    writeText: async (text: string): Promise<SystemResult<void>> => {
      const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
      if (!resolved.ok) {
        return resolved.failure;
      }
      return resolved.provider.writeText(text);
    }
  };
}
