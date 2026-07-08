/**
 * @file deep-link web provider skeleton — launch URL only (no push deliveries in v1).
 * No browser globals at module scope (SSR-safe).
 */
import type { LogApi } from "@moku-labs/common";
import type { DeepLinkConfig } from "../types";
import type { DeepLinkProvider } from "./types";

/**
 * Create the web deep-link provider: getCurrent reflects the launch URL; dispose is a
 * no-op (no OS listener on web).
 *
 * @param {DeepLinkConfig} _config - Resolved config (scheme allowlist).
 * @param {LogApi} _log - ctx.log for error reporting (MC2).
 * @example
 * ```ts
 * const provider = await createWebDeepLinkProvider(config, log);
 * ```
 */
export async function createWebDeepLinkProvider(
  _config: DeepLinkConfig,
  _log: LogApi
): Promise<DeepLinkProvider> {
  throw new Error("not implemented");
}
