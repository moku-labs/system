/**
 * @file notify Tauri provider — `@tauri-apps/plugin-notification` glue. The package is
 * reached ONLY via `await import("@tauri-apps/plugin-notification")` inside the factory
 * body (stays a live lazy import in dist). show() checks isPermissionGranted() itself
 * (never requestPermission()) so it can never trigger the OS prompt — requestPermission()
 * is the ONLY place a prompt may originate.
 */
import type { LogApi } from "@moku-labs/common";
import type { SystemResult } from "../../runtime/result";
import { err, mapThrownToResult, ok } from "../../runtime/result";
import type { NotifyOptions } from "../types";
import type { NotifyProvider } from "./types";

const PROVIDER = "tauri";

/**
 * Convert a thrown/rejected value into an Error for ctx.log.error's typed `error` param.
 *
 * @param {unknown} thrown - Whatever was thrown or rejected.
 * @returns {Error} The thrown value as an Error, wrapping non-Error throws.
 * @example
 * ```ts
 * catch (error) { log.error("notify:tauri-show-failed", undefined, toError(error)); }
 * ```
 */
function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Create the Tauri notification provider. Factory-time throws propagate (folded to
 * "unavailable" by startResolution); method-time throws map to "error" — never "denied"
 * (D-004). "denied" is produced only from the plugin's own returned permission signals.
 *
 * @param {LogApi} log - ctx.log for error reporting (MC2).
 * @returns {Promise<NotifyProvider>} The Tauri-backed notification provider.
 * @example
 * ```ts
 * const provider = await createTauriNotifyProvider(log);
 * ```
 */
export async function createTauriNotifyProvider(log: LogApi): Promise<NotifyProvider> {
  const { isPermissionGranted, requestPermission, sendNotification } = await import(
    "@tauri-apps/plugin-notification"
  );

  return {
    /**
     * Whether notification permission is currently granted.
     *
     * @returns {Promise<SystemResult<boolean>>} Granted state.
     * @example
     * ```ts
     * const r = await provider.isPermissionGranted();
     * ```
     */
    isPermissionGranted: async (): Promise<SystemResult<boolean>> => {
      try {
        const granted = await isPermissionGranted();
        return ok(granted, PROVIDER);
      } catch (error) {
        log.error("notify:tauri-is-permission-granted-failed", undefined, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Prompt the user for notification permission. Returns ok(false) for any non-granted
     * returned signal ("denied", "default", …) — that mapping is allowed because the value
     * is a returned permission state, never a thrown ambiguous error (D-004 covers throws only).
     *
     * @returns {Promise<SystemResult<boolean>>} Granted after the prompt.
     * @example
     * ```ts
     * const r = await provider.requestPermission();
     * ```
     */
    requestPermission: async (): Promise<SystemResult<boolean>> => {
      try {
        const permission = await requestPermission();
        return ok(permission === "granted", PROVIDER);
      } catch (error) {
        log.error("notify:tauri-request-permission-failed", undefined, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Show a notification. Checks isPermissionGranted() itself — never calls
     * requestPermission() — so this method can never trigger the OS prompt.
     *
     * @param {NotifyOptions} options - Notification content.
     * @returns {Promise<SystemResult<void>>} ok when displayed.
     * @example
     * ```ts
     * const r = await provider.show({ title: "Done" });
     * ```
     */
    show: async (options: NotifyOptions): Promise<SystemResult<void>> => {
      try {
        const granted = await isPermissionGranted();
        if (!granted) {
          return err(PROVIDER, "denied", "notification permission not granted");
        }
        sendNotification(options);
        return ok(undefined, PROVIDER);
      } catch (error) {
        log.error("notify:tauri-show-failed", { title: options.title }, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Teardown — no-op; there is no OS artifact to release for the notification provider.
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
