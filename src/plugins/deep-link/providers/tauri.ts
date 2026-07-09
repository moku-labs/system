/**
 * @file deep-link Tauri provider — `@tauri-apps/plugin-deep-link` glue. The package is
 * reached ONLY via `await import("@tauri-apps/plugin-deep-link")` inside the factory
 * body (stays a live lazy import in dist). Registers onOpenUrl onto the onUrl channel;
 * dispose unregisters the OS listener. The provider does NOT dedupe — onOpenUrl
 * registration may itself replay the last URL, so the plugin-layer dedup
 * (state.lastUrl, see api.ts's createDeliver) is the guard.
 */
import type { LogApi } from "@moku-labs/common";
import type { SystemResult } from "../../runtime/result";
import { mapThrownToResult, ok } from "../../runtime/result";
import type { DeepLinkConfig } from "../types";
import type { DeepLinkProvider } from "./types";

const PROVIDER = "tauri";

/**
 * Convert a thrown/rejected value into an Error for ctx.log.error's typed `error` param.
 *
 * @param {unknown} thrown - Whatever was thrown or rejected.
 * @returns {Error} The thrown value as an Error, wrapping non-Error throws.
 * @example
 * ```ts
 * catch (error) { log.error("deepLink:tauri-get-current-failed", undefined, toError(error)); }
 * ```
 */
function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Create the Tauri deep-link provider. Factory-time throws propagate (folded to
 * "unavailable" by startResolution); method-time throws map to "error" — never "denied".
 *
 * @param {DeepLinkConfig} _config - Resolved config (scheme allowlist; filtering happens
 *   in the plugin layer, not here).
 * @param {LogApi} log - ctx.log for error reporting (MC2).
 * @param {(url: string) => void} onUrl - Delivery channel for runtime OS deliveries.
 * @returns {Promise<DeepLinkProvider>} The Tauri-backed deep-link provider.
 * @example
 * ```ts
 * const provider = await createTauriDeepLinkProvider(config, log, onUrl);
 * ```
 */
export async function createTauriDeepLinkProvider(
  _config: DeepLinkConfig,
  log: LogApi,
  onUrl: (url: string) => void
): Promise<DeepLinkProvider> {
  const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
  const unlisten = await onOpenUrl(urls => {
    for (const url of urls) {
      onUrl(url);
    }
  });

  return {
    /**
     * The URL the app was launched with (first element of the plugin's URL list, or
     * null when none).
     *
     * @returns {Promise<SystemResult<string | null>>} Launch URL or null.
     * @example
     * ```ts
     * const r = await provider.getCurrent();
     * ```
     */
    getCurrent: async (): Promise<SystemResult<string | null>> => {
      try {
        const urls = await getCurrent();
        // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — null is the documented "no launch URL" value
        return ok(urls?.[0] ?? null, PROVIDER);
      } catch (error) {
        log.error("deepLink:tauri-get-current-failed", undefined, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Unregisters the OS onOpenUrl listener.
     *
     * @returns {Promise<void>} Resolves once teardown completes.
     * @example
     * ```ts
     * await provider.dispose();
     * ```
     */
    dispose: (): Promise<void> => {
      unlisten();
      return Promise.resolve();
    }
  };
}
