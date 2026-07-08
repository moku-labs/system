/**
 * @file deep-link Tauri provider skeleton — `@tauri-apps/plugin-deep-link` glue. The
 * package is reached ONLY via `await import("@tauri-apps/plugin-deep-link")` inside the
 * factory body (stays a live lazy import in dist). Registers onOpenUrl onto the onUrl
 * channel; dispose unregisters the OS listener.
 */
import type { LogApi } from "@moku-labs/common";
import type { DeepLinkConfig } from "../types";
import type { DeepLinkProvider } from "./types";

/**
 * Create the Tauri deep-link provider. Factory-time throws propagate (folded to
 * "unavailable" by startResolution); method-time throws map to "error" — never "denied".
 *
 * @param {DeepLinkConfig} _config - Resolved config (scheme allowlist).
 * @param {LogApi} _log - ctx.log for error reporting (MC2).
 * @param {(url: string) => void} _onUrl - Delivery channel for runtime OS deliveries.
 * @example
 * ```ts
 * const provider = await createTauriDeepLinkProvider(config, log, onUrl);
 * ```
 */
export async function createTauriDeepLinkProvider(
  _config: DeepLinkConfig,
  _log: LogApi,
  _onUrl: (url: string) => void
): Promise<DeepLinkProvider> {
  throw new Error("not implemented");
}
