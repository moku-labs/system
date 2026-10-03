/**
 * @file lifecycle Tauri provider — the shared visibility source PLUS the native
 * `tauri://suspended` / `tauri://resumed` events (D-S02). `@tauri-apps/api/event` is reached
 * ONLY via `await import("@tauri-apps/api/event")` inside the factory (stays a live lazy import
 * in dist).
 *
 * Why both sources: P15 measured iOS sending `tauri://suspended` 1.5 s before
 * `visibilitychange` hidden (native wins the race; the signal's dedupe drops the late one), and
 * Rust emits Suspended/Resumed only on mobile, so desktop Tauri relies on `visibilitychange`.
 * A missing `@tauri-apps/api` or a rejected `listen` only warns: the visibility source keeps
 * working and the provider still resolves. So no requirePeer, and no native registry row
 * (`core:event:default` is part of `core:default`).
 */
import type { LogApi } from "@moku-labs/common";
import type { LifecycleProvider, LifecycleSignal } from "./types";
import { watchVisibility } from "./visibility";

/** Native event for a suspended app (`TauriEvent.WINDOW_SUSPENDED` in `@tauri-apps/api` 2.12). */
const SUSPENDED_EVENT = "tauri://suspended";

/** Native event for a resumed app (`TauriEvent.WINDOW_RESUMED` in `@tauri-apps/api` 2.12). */
const RESUMED_EVENT = "tauri://resumed";

/** Log key for a native event channel that could not be opened. */
const EVENTS_UNAVAILABLE = "lifecycle:tauri-events-unavailable";

/** Log key for a native unlisten that threw or rejected at dispose. */
const UNLISTEN_FAILED = "lifecycle:tauri-unlisten-failed";

/**
 * Remove one native listener. `UnlistenFn` is typed `() => void` in `@tauri-apps/api` 2.x, but
 * the function returns a Promise (an IPC call), so the type allows both.
 */
type Unlisten = () => void | Promise<void>;

/**
 * Best-effort message of a thrown or rejected value, for the warning.
 *
 * @param {unknown} thrown - Whatever was thrown or rejected.
 * @returns {string} The Error message, or the value as a string.
 * @example
 * ```ts
 * messageOf(new Error("not allowed")); // "not allowed"
 * ```
 */
function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/**
 * Call one native unlisten and wait for it. A synchronous throw or a rejection is logged at
 * warn and is not an error: the app is stopping anyway.
 *
 * @param {LogApi} log - ctx.log for the warning (MC2).
 * @param {Unlisten} unlisten - The unlisten function `listen` resolved with.
 * @returns {Promise<void>} Resolves once the native listener is gone or the failure is logged.
 * @example
 * ```ts
 * // The IPC channel closed: unlisten rejects with Error("ipc closed").
 * await unlistenSafely(log, unlisten); // resolves undefined
 * // log.warn("lifecycle:tauri-unlisten-failed", { message: "ipc closed" })
 * ```
 */
async function unlistenSafely(log: LogApi, unlisten: Unlisten): Promise<void> {
  try {
    await unlisten();
  } catch (error) {
    log.warn(UNLISTEN_FAILED, { message: messageOf(error) });
  }
}

/**
 * Listen to the native suspend/resume events. Each listener that registers is kept, even when
 * the other one fails. A failed import or a rejected `listen` is logged once at warn and is not
 * an error: the visibility source still covers the app.
 *
 * @param {LogApi} log - ctx.log for the warning (MC2).
 * @param {LifecycleSignal} signal - Where each phase goes.
 * @returns {Promise<Unlisten[]>} The unlisten functions of the listeners that registered.
 * @example
 * ```ts
 * const unlisteners = await listenNative(log, phase => phases.push(phase)); // 2 on a Tauri shell
 * ```
 */
async function listenNative(log: LogApi, signal: LifecycleSignal): Promise<Unlisten[]> {
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const results = await Promise.allSettled([
      listen(SUSPENDED_EVENT, () => signal("pause")),
      listen(RESUMED_EVENT, () => signal("resume"))
    ]);

    const failure = results.find(result => result.status === "rejected");
    if (failure !== undefined) {
      log.warn(EVENTS_UNAVAILABLE, { message: messageOf(failure.reason) });
    }

    return results.flatMap(result => (result.status === "fulfilled" ? [result.value] : []));
  } catch (error) {
    log.warn(EVENTS_UNAVAILABLE, { message: messageOf(error) });
    return [];
  }
}

/**
 * Create the Tauri lifecycle provider: the visibility source plus the native suspend/resume
 * events, on every platform. Never fails because of the native channel: without it the
 * provider runs on visibility alone. dispose removes the DOM listener, calls each unlisten
 * once and waits for it; a failed unlisten only warns.
 *
 * @param {LogApi} log - ctx.log for the warning when the native events are unavailable (MC2).
 * @param {LifecycleSignal} signal - Where each phase goes (createSignal dedupes).
 * @returns {Promise<LifecycleProvider>} The Tauri-backed provider.
 * @example
 * ```ts
 * const provider = await createTauriLifecycleProvider(log, phase => phases.push(phase));
 * // iOS: tauri://suspended → ["pause"], then visibilitychange hidden → ["pause", "pause"]
 * await provider.dispose(); // native and DOM listeners removed
 * ```
 */
export async function createTauriLifecycleProvider(
  log: LogApi,
  signal: LifecycleSignal
): Promise<LifecycleProvider> {
  const stopWatching = watchVisibility(signal);
  const unlisteners = await listenNative(log, signal);

  // Tauri unregisters a listener once; a second unlisten call is never made.
  let disposed = false;

  return {
    /**
     * Teardown — removes the `visibilitychange` listener and calls each native unlisten once,
     * in parallel. A throwing or rejecting unlisten is logged at warn
     * (`lifecycle:tauri-unlisten-failed`) and never rejects dispose. Idempotent: a second call
     * does nothing.
     *
     * @returns {Promise<void>} Resolves once every native unlisten has settled.
     * @example
     * ```ts
     * await provider.dispose(); // tauri://suspended and a hidden window no longer report "pause"
     * ```
     */
    dispose: async (): Promise<void> => {
      if (disposed) {
        return;
      }
      disposed = true;

      stopWatching();
      await Promise.all(unlisteners.map(unlisten => unlistenSafely(log, unlisten)));
    }
  };
}
