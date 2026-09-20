/**
 * @file deep-link Tauri provider — `@tauri-apps/plugin-deep-link` glue. The package is
 * reached ONLY via `await import("@tauri-apps/plugin-deep-link")` inside the factory
 * body (stays a live lazy import in dist). Registers onOpenUrl onto the onUrl channel;
 * dispose unregisters the OS listener. The provider does NOT dedupe — the OS may replay
 * the launch URL onto the fresh listener, and it may do so BEFORE the app ever calls
 * getCurrent(), so the symmetric plugin-layer handover (state.handedOver, see api.ts)
 * is what makes each launch URL reach the app exactly once.
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

  // getCurrent() reports a LIST; its API returns one URL. The rest are real launch
  // intents, so they go down the delivery channel — once, however often getCurrent
  // is called.
  let extrasForwarded = false;

  return {
    /**
     * The URL the app was launched with (first element of the plugin's URL list, or
     * null when none). Any further launch URLs are forwarded through onUrl instead of
     * being dropped.
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
        if (!extrasForwarded && urls !== null && urls.length > 1) {
          extrasForwarded = true;
          for (const extra of urls.slice(1)) {
            onUrl(extra);
          }
        }
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
