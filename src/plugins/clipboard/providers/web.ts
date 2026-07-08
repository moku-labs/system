/**
 * @file clipboard web provider skeleton — navigator.clipboard. Feature-probed (no
 * permissions.query); NotAllowedError → "denied". No browser globals at module scope
 * (SSR-safe).
 */
import type { LogApi } from "@moku-labs/common";
import type { ClipboardProvider } from "./types";

/**
 * Create the web clipboard provider. Missing navigator.clipboard yields the
 * unsupported branch (CLIPBOARD_METHODS via unsupportedProvider).
 *
 * @param {LogApi} _log - ctx.log for error reporting (MC2).
 * @example
 * ```ts
 * const provider = await createWebClipboardProvider(log);
 * ```
 */
export async function createWebClipboardProvider(_log: LogApi): Promise<ClipboardProvider> {
  throw new Error("not implemented");
}
