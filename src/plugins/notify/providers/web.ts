/**
 * @file notify web provider skeleton — Web Notification API. No browser globals at
 * module scope (SSR-safe); absence of the Notification global → unsupportedProvider.
 */
import type { LogApi } from "@moku-labs/common";
import type { NotifyProvider } from "./types";

/**
 * Create the web notification provider. Missing Notification global yields the
 * unsupported branch (NOTIFY_METHODS via unsupportedProvider).
 *
 * @param {LogApi} _log - ctx.log for error reporting (MC2).
 * @example
 * ```ts
 * const provider = await createWebNotifyProvider(log);
 * ```
 */
export async function createWebNotifyProvider(_log: LogApi): Promise<NotifyProvider> {
  throw new Error("not implemented");
}
