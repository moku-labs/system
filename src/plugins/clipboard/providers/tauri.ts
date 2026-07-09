/**
 * @file clipboard Tauri provider — `@tauri-apps/plugin-clipboard-manager` glue. The
 * package is reached ONLY via `await import("@tauri-apps/plugin-clipboard-manager")`
 * inside the factory body (stays a live lazy import in dist).
 */
import type { LogApi } from "@moku-labs/common";
import type { SystemResult } from "../../runtime/result";
import { mapThrownToResult, ok } from "../../runtime/result";
import type { ClipboardProvider } from "./types";

const PROVIDER = "tauri";

/**
 * Convert a thrown/rejected value into an Error for ctx.log.error's typed `error` param.
 *
 * @param {unknown} thrown - Whatever was thrown or rejected.
 * @returns {Error} The thrown value as an Error, wrapping non-Error throws.
 * @example
 * ```ts
 * catch (error) { log.error("clipboard:tauri-read-failed", undefined, toError(error)); }
 * ```
 */
function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Create the Tauri clipboard provider. Factory-time throws propagate (folded to
 * "unavailable" by startResolution); method-time throws map to "error" — never "denied"
 * (Tauri ACL "not allowed" throws are ambiguous, D-004).
 *
 * @param {LogApi} log - ctx.log for error reporting (MC2).
 * @returns {Promise<ClipboardProvider>} The Tauri-backed clipboard provider.
 * @example
 * ```ts
 * const provider = await createTauriClipboardProvider(log);
 * ```
 */
export async function createTauriClipboardProvider(log: LogApi): Promise<ClipboardProvider> {
  const { readText, writeText } = await import("@tauri-apps/plugin-clipboard-manager");

  return {
    /**
     * Read the current clipboard text via the native plugin.
     *
     * @returns {Promise<SystemResult<string>>} Clipboard contents or a typed failure.
     * @example
     * ```ts
     * const r = await provider.readText();
     * ```
     */
    readText: async (): Promise<SystemResult<string>> => {
      try {
        const text = await readText();
        return ok(text, PROVIDER);
      } catch (error) {
        log.error("clipboard:tauri-read-failed", undefined, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Write text to the clipboard via the native plugin.
     *
     * @param {string} text - Text to write.
     * @returns {Promise<SystemResult<void>>} ok when written.
     * @example
     * ```ts
     * const r = await provider.writeText("copy me");
     * ```
     */
    writeText: async (text: string): Promise<SystemResult<void>> => {
      try {
        await writeText(text);
        return ok(undefined, PROVIDER);
      } catch (error) {
        log.error("clipboard:tauri-write-failed", { text }, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Teardown — no-op; there is no OS artifact to release for the clipboard provider.
     *
     * @returns {Promise<void>} Resolves immediately.
     * @example
     * ```ts
     * await provider.dispose();
     * ```
     */
    dispose: (): Promise<void> => Promise.resolve()
  };
}
