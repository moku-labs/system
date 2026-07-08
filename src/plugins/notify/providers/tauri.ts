/**
 * @file notify Tauri provider skeleton — `@tauri-apps/plugin-notification` glue. The
 * package is reached ONLY via `await import("@tauri-apps/plugin-notification")` inside
 * the factory body (stays a live lazy import in dist).
 */
import type { LogApi } from "@moku-labs/common";
import type { NotifyProvider } from "./types";

/**
 * Create the Tauri notification provider. Factory-time throws propagate (folded to
 * "unavailable" by startResolution); method-time throws map to "error" — never "denied".
 *
 * @param {LogApi} _log - ctx.log for error reporting (MC2).
 * @example
 * ```ts
 * const provider = await createTauriNotifyProvider(log);
 * ```
 */
export async function createTauriNotifyProvider(_log: LogApi): Promise<NotifyProvider> {
  throw new Error("not implemented");
}
