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
 * Whether the webview exposes a `Notification` constructor. The plugin's
 * `sendNotification` is a synchronous void call that does `new window.Notification(...)`
 * under the hood, so its absence is a capability gap ("unavailable"), not a caller
 * error — probing it keeps `show()` from reporting an opaque TypeError.
 *
 * @returns {boolean} True when `window.Notification` can be constructed.
 * @example
 * ```ts
 * if (!hasNotificationConstructor()) return err("tauri", "unavailable", "...");
 * ```
 */
function hasNotificationConstructor(): boolean {
  const scope = globalThis as { window?: { Notification?: unknown } };
  return typeof scope.window?.Notification === "function";
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

  // Granted state is an IPC round-trip per read; show() would pay it on every call.
  // ONLY "granted" is cached: permission is granted once and stays granted for the
  // session, while a not-granted state is exactly what the user flips in OS settings
  // while the app runs. Caching `false` would pin the app in "denied" forever. A throw
  // is never cached either, so a transient IPC failure cannot pin the state.
  let grantedCache: true | undefined;

  /**
   * Record a freshly read granted state — `true` is cached, anything else clears the
   * cache so the next read goes back to the plugin.
   *
   * @param {boolean} granted - The granted state just read from the plugin.
   * @returns {boolean} The same granted state, for direct return.
   * @example
   * ```ts
   * return ok(rememberGranted(await isPermissionGranted()), PROVIDER);
   * ```
   */
  function rememberGranted(granted: boolean): boolean {
    grantedCache = granted ? true : undefined;
    return granted;
  }

  /**
   * Read the granted state, reusing the cached value only while it says "granted".
   *
   * @returns {Promise<boolean>} Whether notification permission is granted.
   * @example
   * ```ts
   * if (!(await readGranted())) return err(PROVIDER, "denied", "...");
   * ```
   */
  async function readGranted(): Promise<boolean> {
    if (grantedCache === true) {
      return true;
    }
    return rememberGranted(await isPermissionGranted());
  }

  return {
    /**
     * Whether notification permission is currently granted. Always reads through to the
     * plugin and refreshes the cache — this is the caller's way to pick up a permission
     * the user changed in OS settings while the app was running.
     *
     * @returns {Promise<SystemResult<boolean>>} Granted state.
     * @example
     * ```ts
     * const r = await provider.isPermissionGranted();
     * ```
     */
    isPermissionGranted: async (): Promise<SystemResult<boolean>> => {
      try {
        return ok(rememberGranted(await isPermissionGranted()), PROVIDER);
      } catch (error) {
        log.error("notify:tauri-is-permission-granted-failed", undefined, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Prompt the user for notification permission. Returns ok(false) for any non-granted
     * returned signal ("denied", "default", …) — that mapping is allowed because the value
     * is a returned permission state, never a thrown ambiguous error (D-004 covers throws only).
     * The prompt's answer replaces the cached granted state; a non-granted answer clears it.
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
        return ok(rememberGranted(permission === "granted"), PROVIDER);
      } catch (error) {
        log.error("notify:tauri-request-permission-failed", undefined, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Show a notification. Checks the granted state itself — never calls
     * requestPermission() — so this method can never trigger the OS prompt. A
     * not-granted answer is re-read on every call, so a permission the user grants in
     * OS settings mid-session is picked up without restarting the app. The synchronous
     * `sendNotification` runs inside the try/catch, so its failure is observed and
     * returned instead of escaping as an unhandled throw.
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
        const granted = await readGranted();
        if (!granted) {
          return err(PROVIDER, "denied", "notification permission not granted");
        }
        if (!hasNotificationConstructor()) {
          return err(PROVIDER, "unavailable", "window.Notification is unavailable in this webview");
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
