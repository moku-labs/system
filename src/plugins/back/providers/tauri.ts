/**
 * @file back Tauri provider — `@tauri-apps/api/app` glue, Android only. The package is
 * reached ONLY via `await import("@tauri-apps/api/app")` inside the factory body (stays a
 * live lazy import in dist). Resolution registers nothing: `listen()` registers the native
 * Back listener when the plugin layer asks, which it does only while handlers exist
 * (D-S04). Any registered listener replaces the Android default, so the press handler
 * replays that default when no handler took the press: `history.back()` when the webview
 * can go back, else `exit(0)` (P14, `AppPlugin.kt`). `dispose()` unregisters once and is
 * final: afterwards `listen` and `exit` answer `err("tauri", "unavailable", "app stopped")`
 * and `unlisten` is a no-op that resolves ok.
 */
import type { LogApi } from "@moku-labs/common";
import type { SystemResult } from "../../runtime/result";
import { err, mapThrownToResult, ok } from "../../runtime/result";
import type { BackProvider } from "./types";

const PROVIDER = "tauri";

/** What `onBackButtonPress` hands its handler (structural, local — no `@tauri-apps` re-export). */
type BackButtonPayload = { canGoBack: boolean };

/**
 * Structural shape of the `history` subset the default replays. Declared locally because
 * the project's tsconfig has no DOM lib, so there is no ambient `history` global.
 */
type WebHistory = { back: () => void };

/** `exit` as this provider reads it: absent on an `@tauri-apps/api` older than 2.12 (D-S06). */
type AppExit = ((code?: number) => Promise<void>) | undefined;

/**
 * Convert a thrown/rejected value into an Error for ctx.log.error's typed `error` param.
 *
 * @param {unknown} thrown - Whatever was thrown or rejected.
 * @returns {Error} The thrown value as an Error, wrapping non-Error throws.
 * @example
 * ```ts
 * toError("boom").message; // "boom"
 * ```
 */
function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Go back one entry in the webview history: the first half of the platform default.
 * `history` is read at press time, never at module scope (SSR-safe); without it this
 * does nothing.
 *
 * @example
 * ```ts
 * goBack(); // same as history.back() inside the webview
 * ```
 */
function goBack(): void {
  // `history` has no ambient declaration under this DOM-lib-free tsconfig — narrowed
  // immediately via a local structural type, as the deep-link web provider does for `location`.
  const globalScope = globalThis as { history?: WebHistory };
  globalScope.history?.back();
}

/**
 * Create the Tauri Android back provider. Factory-time throws propagate (folded to
 * "unavailable" by startResolution); method-time throws map to "error" — never "denied"
 * (Tauri ACL throws are ambiguous, D-004).
 *
 * @param {LogApi} log - ctx.log for failure reporting (MC2).
 * @returns {Promise<BackProvider>} The Tauri-backed back provider.
 * @example
 * ```ts
 * const provider = await createTauriBackProvider(ctx.log); // registers nothing yet
 * await provider.listen(() => dispatch(ctx)); // { ok: true, value: undefined, provider: "tauri" }
 * ```
 */
export async function createTauriBackProvider(log: LogApi): Promise<BackProvider> {
  const app = await import("@tauri-apps/api/app");
  const onBackButtonPress = app.onBackButtonPress;
  // Checked on every call: the peer floor is 2.12 (D-S06), but a mismatched install may lack it.
  const appExit: AppExit = app.exit;

  /** Handle of the registered native listener; `unregister()` restores the system Back. */
  type BackListener = Awaited<ReturnType<typeof onBackButtonPress>>;

  let listener: BackListener | undefined;

  // dispose() removes the listener at app.stop(). A call arriving after that must not
  // register a new one the stopped app would never remove, nor close the app.
  let disposed = false;

  /**
   * Close the app with exit code 0, which finishes the Android activity.
   *
   * @returns {Promise<SystemResult<void>>} ok once the exit was requested.
   * @example
   * ```ts
   * await exitApp(); // { ok: true, value: undefined, provider: "tauri" } — the activity finishes
   * ```
   */
  async function exitApp(): Promise<SystemResult<void>> {
    if (disposed) {
      return err(PROVIDER, "unavailable", "app stopped");
    }
    if (typeof appExit !== "function") {
      return err(PROVIDER, "unavailable", "exit() needs @tauri-apps/api 2.12 or newer");
    }
    try {
      await appExit(0);
      return ok(undefined, PROVIDER);
    } catch (error) {
      // A missing core:app:allow-exit lands here as "error" with the raw message.
      return mapThrownToResult(PROVIDER, error);
    }
  }

  /**
   * The native press handler. The handlers get the press first; when none takes it, the
   * platform default the listener replaced runs: back in history, else close the app.
   *
   * @param {() => boolean} dispatch - Runs the plugin's handlers, newest first.
   * @param {BackButtonPayload} payload - Whether the webview can go back.
   * @returns {Promise<void>} Resolves once the press is handled; never rejects.
   * @example
   * ```ts
   * await handlePress(() => false, { canGoBack: true }); // no handler took it: history.back()
   * ```
   */
  async function handlePress(dispatch: () => boolean, payload: BackButtonPayload): Promise<void> {
    if (dispatch()) {
      return;
    }

    if (payload.canGoBack) {
      goBack();
      return;
    }

    const result = await exitApp();
    if (!result.ok) {
      log.warn("back:default-exit-failed", { reason: result.reason, message: result.message });
    }
  }

  /**
   * Unregister one native listener. A failure is logged and returned, never thrown.
   *
   * @param {BackListener} handle - The listener to remove.
   * @returns {Promise<SystemResult<void>>} ok once the system Back is restored.
   * @example
   * ```ts
   * // Android already dropped the native listener.
   * await unregister(registered);
   * // { ok: false, provider: "tauri", reason: "error", message: "listener already gone" },
   * // also logged as "back:tauri-unlisten-failed"
   * ```
   */
  async function unregister(handle: BackListener): Promise<SystemResult<void>> {
    try {
      await handle.unregister();
      return ok(undefined, PROVIDER);
    } catch (error) {
      log.error("back:tauri-unlisten-failed", undefined, toError(error));
      return mapThrownToResult(PROVIDER, error);
    }
  }

  return {
    /**
     * Register the native Back listener. Holding one already answers ok without a second
     * registration. A registration that lands after dispose() is removed at once.
     *
     * @param {() => boolean} dispatch - Runs the plugin's handlers, newest first.
     * @returns {Promise<SystemResult<void>>} ok once the listener is registered.
     * @example
     * ```ts
     * await provider.listen(() => dispatch(ctx)); // ok: presses now reach the handlers
     * ```
     */
    listen: async (dispatch: () => boolean): Promise<SystemResult<void>> => {
      if (disposed) {
        return err(PROVIDER, "unavailable", "app stopped");
      }
      if (listener !== undefined) {
        return ok(undefined, PROVIDER);
      }

      try {
        const registered = await onBackButtonPress(payload => handlePress(dispatch, payload));
        if (disposed) {
          // app.stop() ran while the registration was in flight: give Back straight back.
          await unregister(registered);
          return err(PROVIDER, "unavailable", "app stopped");
        }
        listener = registered;
        return ok(undefined, PROVIDER);
      } catch (error) {
        log.error("back:tauri-listen-failed", undefined, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Unregister the native listener, which restores the system Back. Ok when none is held.
     * When the unregister fails the native listener may still be live, so the handle is
     * kept: a later `listen` reuses it instead of registering a second one, and `dispose`
     * retries the unregister.
     *
     * @returns {Promise<SystemResult<void>>} ok once no listener is registered.
     * @example
     * ```ts
     * await provider.unlisten(); // ok: the system Back works again
     * ```
     */
    unlisten: async (): Promise<SystemResult<void>> => {
      const current = listener;
      if (current === undefined) {
        return ok(undefined, PROVIDER);
      }
      listener = undefined;
      const result = await unregister(current);
      // Restore only when dispose() has not run and no new listen() took the slot meanwhile.
      const shouldKeepHandle = !result.ok && !disposed && listener === undefined;
      if (shouldKeepHandle) {
        listener = current;
      }
      return result;
    },

    exit: exitApp,

    /**
     * Teardown — unregisters the listener once. Final, idempotent, and never rejects:
     * stopResolution awaits it at app.stop().
     *
     * @returns {Promise<void>} Resolves once the system Back is restored.
     * @example
     * ```ts
     * await provider.dispose();
     * await provider.exit(); // { ok: false, provider: "tauri", reason: "unavailable", message: "app stopped" }
     * ```
     */
    dispose: async (): Promise<void> => {
      if (disposed) {
        return;
      }
      disposed = true;

      const current = listener;
      listener = undefined;
      if (current !== undefined) {
        await unregister(current);
      }
    }
  };
}
