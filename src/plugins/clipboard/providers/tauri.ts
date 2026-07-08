/**
 * @file clipboard Tauri provider skeleton — `@tauri-apps/plugin-clipboard-manager` glue.
 * The package is reached ONLY via `await import("@tauri-apps/plugin-clipboard-manager")`
 * inside the factory body (stays a live lazy import in dist).
 */
import type { LogApi } from "@moku-labs/common";
import type { ClipboardProvider } from "./types";

/**
 * Create the Tauri clipboard provider. Factory-time throws propagate (folded to
 * "unavailable" by startResolution); method-time throws map to "error" — never "denied".
 *
 * @param {LogApi} _log - ctx.log for error reporting (MC2).
 * @example
 * ```ts
 * const provider = await createTauriClipboardProvider(log);
 * ```
 */
export async function createTauriClipboardProvider(_log: LogApi): Promise<ClipboardProvider> {
  throw new Error("not implemented");
}
