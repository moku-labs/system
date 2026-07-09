/**
 * @file notify web provider — Web Notification API. No browser globals at module scope
 * (SSR-safe); absence of the Notification global → unsupportedProvider. show() reads
 * Notification.permission itself (never calls Notification.requestPermission()) so it
 * can never trigger the browser prompt.
 */
import type { LogApi } from "@moku-labs/common";
import type { SystemResult } from "../../runtime/result";
import { err, mapThrownToResult, ok, unsupportedProvider } from "../../runtime/result";
import type { NotifyOptions } from "../types";
import type { NotifyProvider } from "./types";
import { NOTIFY_METHODS } from "./types";

const PROVIDER = "web";

/**
 * Structural, local mirror of the DOM `NotificationPermission` union. Declared locally
 * (rather than relying on the DOM lib) because this project's tsconfig targets
 * Bun/Node with `lib: ["ESNext"]` only — no ambient `Notification` global.
 */
type WebNotificationPermission = "default" | "denied" | "granted";

/**
 * Structural, local mirror of the browser's global `Notification` constructor — the
 * minimal surface this provider uses.
 */
type WebNotificationConstructor = {
  new (title: string, options?: { body?: string }): unknown;
  readonly permission: WebNotificationPermission;
  requestPermission: () => Promise<WebNotificationPermission>;
};

/**
 * Read the `Notification` global through a local structural type, undefined when the
 * global is absent (SSR / old browser / insecure context).
 *
 * @returns {WebNotificationConstructor | undefined} The Notification constructor, or undefined.
 * @example
 * ```ts
 * const NotificationCtor = readNotificationGlobal();
 * ```
 */
function readNotificationGlobal(): WebNotificationConstructor | undefined {
  const globalScope = globalThis as { Notification?: WebNotificationConstructor };
  return globalScope.Notification;
}

/**
 * Convert a thrown/rejected value into an Error for ctx.log.error's typed `error` param.
 *
 * @param {unknown} thrown - Whatever was thrown or rejected.
 * @returns {Error} The thrown value as an Error, wrapping non-Error throws.
 * @example
 * ```ts
 * catch (error) { log.error("notify:web-show-failed", undefined, toError(error)); }
 * ```
 */
function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Create the web notification provider. Missing Notification global yields the
 * unsupported branch (NOTIFY_METHODS via unsupportedProvider).
 *
 * @param {LogApi} log - ctx.log for error reporting (MC2).
 * @returns {Promise<NotifyProvider>} The Notification-API-backed provider, or the
 *   all-unsupported stand-in when the global is absent.
 * @example
 * ```ts
 * const provider = await createWebNotifyProvider(log);
 * ```
 */
export async function createWebNotifyProvider(log: LogApi): Promise<NotifyProvider> {
  const NotificationCtor = readNotificationGlobal();
  if (NotificationCtor === undefined) {
    return unsupportedProvider(PROVIDER, NOTIFY_METHODS);
  }

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
    isPermissionGranted: (): Promise<SystemResult<boolean>> =>
      Promise.resolve(ok(NotificationCtor.permission === "granted", PROVIDER)),

    /**
     * Prompt the user for notification permission. Returns ok(false) for any
     * non-granted returned signal ("denied", "default") — that mapping is allowed
     * because the value is a returned permission state, never a thrown ambiguous
     * error (D-004 covers throws only).
     *
     * @returns {Promise<SystemResult<boolean>>} Granted after the prompt.
     * @example
     * ```ts
     * const r = await provider.requestPermission();
     * ```
     */
    requestPermission: async (): Promise<SystemResult<boolean>> => {
      try {
        const permission = await NotificationCtor.requestPermission();
        return ok(permission === "granted", PROVIDER);
      } catch (error) {
        log.error("notify:web-request-permission-failed", undefined, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Show a notification. Reads Notification.permission itself — never calls
     * Notification.requestPermission() — so this method can never trigger the prompt.
     *
     * @param {NotifyOptions} options - Notification content.
     * @returns {Promise<SystemResult<void>>} ok when displayed.
     * @example
     * ```ts
     * const r = await provider.show({ title: "Done" });
     * ```
     */
    show: (options: NotifyOptions): Promise<SystemResult<void>> => {
      if (NotificationCtor.permission !== "granted") {
        return Promise.resolve(err(PROVIDER, "denied", "notification permission not granted"));
      }
      try {
        if (options.body === undefined) {
          new NotificationCtor(options.title);
        } else {
          new NotificationCtor(options.title, { body: options.body });
        }
        return Promise.resolve(ok(undefined, PROVIDER));
      } catch (error) {
        log.error("notify:web-show-failed", { title: options.title }, toError(error));
        return Promise.resolve(mapThrownToResult(PROVIDER, error));
      }
    },

    /**
     * Teardown — no-op; there is no OS artifact to release for the web provider.
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
