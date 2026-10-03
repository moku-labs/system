/**
 * @file keepAwake provider — the Screen Wake Lock API (`navigator.wakeLock`), used for both
 * kinds: in a browser, and inside the Tauri webview (D-S03, P14). No Tauri package import and no
 * native code. Browser globals are read inside the factory, never at module scope (SSR-safe), and
 * typed through local structural types, because this package compiles without the DOM lib.
 */
import type { LogApi } from "@moku-labs/common";
import type { RuntimeKind, SystemResult } from "../../runtime/result";
import { err, mapThrownToResult, ok, unsupportedProvider } from "../../runtime/result";
import type { KeepAwakeProvider } from "./types";
import { KEEP_AWAKE_METHODS } from "./types";

/** Answer to `set(true)` on a hidden page: the browser grants no lock to a hidden page. */
const HIDDEN_MESSAGE = "page hidden — re-acquired when visible";

/** Answer to `set(true)` after `dispose()`. */
const STOPPED_MESSAGE = "app stopped";

/** The part of a `WakeLockSentinel` this provider uses. */
type WakeLockSentinelLike = {
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
};

/** The part of `navigator.wakeLock` this provider uses. */
type WakeLockLike = {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
};

/** The part of `document` this provider uses to follow page visibility. */
type VisibilityDocument = {
  readonly visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
};

/** What one provider instance keeps between calls. */
type WakeLockSession = {
  readonly kind: RuntimeKind;
  readonly log: LogApi;
  readonly wakeLock: WakeLockLike;
  /** Undefined when the runtime has no document: the page then counts as visible. */
  readonly document: VisibilityDocument | undefined;
  /** The caller's last wish: true after `set(true)`, false after `set(false)` or dispose. */
  wanted: boolean;
  /** True once `dispose()` ran. */
  disposed: boolean;
  /** The held lock. Undefined when none is held or the browser dropped it. */
  sentinel: WakeLockSentinelLike | undefined;
  /** The request in flight. Every caller in the meantime shares it. */
  pending: Promise<SystemResult<void>> | undefined;
};

/**
 * Checks that a `navigator.wakeLock` candidate can request a lock.
 *
 * @param candidate - Whatever `navigator.wakeLock` holds.
 * @returns True when `candidate.request` is a function.
 * @example
 * ```ts
 * isWakeLock({}); // false
 * ```
 */
function isWakeLock(candidate: Partial<WakeLockLike> | undefined): candidate is WakeLockLike {
  return typeof candidate?.request === "function";
}

/**
 * Reads `navigator.wakeLock` when it can request a lock.
 *
 * @returns The wake lock, or undefined when `navigator` or the API is missing.
 * @example
 * ```ts
 * readWakeLock(); // undefined during SSR
 * ```
 */
function readWakeLock(): WakeLockLike | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  const { wakeLock } = navigator as unknown as { wakeLock?: Partial<WakeLockLike> };
  return isWakeLock(wakeLock) ? wakeLock : undefined;
}

/**
 * Reads `document` for page visibility.
 *
 * @returns The document, or undefined when the runtime has none.
 * @example
 * ```ts
 * readDocument()?.visibilityState; // "visible" in a foreground tab
 * ```
 */
function readDocument(): VisibilityDocument | undefined {
  return (globalThis as { document?: VisibilityDocument }).document;
}

/**
 * Converts a thrown value into an Error for the typed `error` parameter of `ctx.log.error`.
 *
 * @param thrown - Whatever was thrown or rejected.
 * @returns The thrown value as an Error, wrapping a non-Error throw.
 * @example
 * ```ts
 * toError("boom").message; // "boom"
 * ```
 */
function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Duck-types the one unambiguous "denied" signal: a rejection whose `name` is
 * `"NotAllowedError"`. Matched on the property, not `instanceof DOMException`: this package
 * compiles without the DOM lib, and a webview without the `DOMException` global still rejects
 * with a `name`-carrying object.
 *
 * @param thrown - Whatever was thrown or rejected.
 * @returns True when the rejection is a permission refusal.
 * @example
 * ```ts
 * isNotAllowedError({ name: "NotAllowedError", message: "Battery saver is on" }); // true
 * ```
 */
function isNotAllowedError(
  thrown: unknown
): thrown is { readonly name: string; readonly message?: unknown } {
  return (
    typeof thrown === "object" &&
    thrown !== null &&
    "name" in thrown &&
    thrown.name === "NotAllowedError"
  );
}

/**
 * Whether the page is hidden. Without a document the page counts as visible.
 *
 * @param session - The provider session.
 * @returns True when `document.visibilityState` is `"hidden"`.
 * @example
 * ```ts
 * // A hidden page gets no lock: set(true) answers "unavailable" and keeps the wish.
 * if (isPageHidden(session)) return err(session.kind, "unavailable", HIDDEN_MESSAGE);
 * ```
 */
function isPageHidden(session: WakeLockSession): boolean {
  return session.document?.visibilityState === "hidden";
}

/**
 * Maps a failed lock request. A `NotAllowedError` answers `"denied"` and is not logged: it is a
 * user or policy decision. Every other throw is logged and answers `"error"`.
 *
 * @param session - The provider session.
 * @param thrown - Whatever `request("screen")` threw or rejected with.
 * @returns The typed failure.
 * @example
 * ```ts
 * mapRequestFailure(session, { name: "NotAllowedError", message: "Battery saver is on" });
 * // { ok: false, provider: "web", reason: "denied", message: "Battery saver is on" }
 * ```
 */
function mapRequestFailure(session: WakeLockSession, thrown: unknown): SystemResult<void> {
  if (isNotAllowedError(thrown)) {
    const message = typeof thrown.message === "string" ? thrown.message : undefined;
    return err(session.kind, "denied", message);
  }

  session.log.error("keepAwake:request-failed", undefined, toError(thrown));
  return mapThrownToResult(session.kind, thrown);
}

/**
 * Releases one lock. A throw is swallowed and logged: the wish is already off.
 *
 * @param log - `ctx.log` for the failure (MC2).
 * @param lock - The sentinel to release.
 * @returns Resolves once the release settled.
 * @example
 * ```ts
 * // The lock arrived after set(false): give it back at once.
 * if (!session.wanted) await releaseLock(session.log, lock);
 * ```
 */
async function releaseLock(log: LogApi, lock: WakeLockSentinelLike): Promise<void> {
  try {
    await lock.release();
  } catch (error) {
    log.error("keepAwake:release-failed", undefined, toError(error));
  }
}

/**
 * Releases the held lock, if any.
 *
 * @param session - The provider session.
 * @returns Resolves once the held lock is released.
 * @example
 * ```ts
 * session.wanted = false;
 * await releaseHeldLock(session); // session.sentinel is undefined: the screen may sleep
 * ```
 */
async function releaseHeldLock(session: WakeLockSession): Promise<void> {
  const lock = session.sentinel;
  if (lock === undefined) {
    return;
  }

  session.sentinel = undefined;
  await releaseLock(session.log, lock);
}

/**
 * Keeps a lock that just arrived. A lock that arrives after the wish was dropped, by
 * `set(false)` or dispose while the request was in flight, is released at once.
 *
 * @param session - The provider session.
 * @param lock - The sentinel `request("screen")` resolved with.
 * @returns ok: the request itself succeeded.
 * @example
 * ```ts
 * const lock = await session.wakeLock.request("screen");
 * return keepLock(session, lock); // ok; held until set(false), dispose or a browser drop
 * ```
 */
async function keepLock(
  session: WakeLockSession,
  lock: WakeLockSentinelLike
): Promise<SystemResult<void>> {
  if (!session.wanted) {
    await releaseLock(session.log, lock);
    return ok(undefined, session.kind);
  }

  session.sentinel = lock;
  lock.addEventListener("release", () => {
    // The browser drops the lock when the page hides. A late event never clears a newer lock.
    if (session.sentinel === lock) {
      session.sentinel = undefined;
    }
  });
  return ok(undefined, session.kind);
}

/**
 * Requests a screen lock and keeps it.
 *
 * @param session - The provider session.
 * @returns ok when the lock arrived, otherwise the mapped failure.
 * @example
 * ```ts
 * await requestLock(session); // { ok: true, value: undefined, provider: "web" }
 * ```
 */
async function requestLock(session: WakeLockSession): Promise<SystemResult<void>> {
  let lock: WakeLockSentinelLike;
  try {
    lock = await session.wakeLock.request("screen");
  } catch (error) {
    return mapRequestFailure(session, error);
  }

  return keepLock(session, lock);
}

/**
 * Starts a lock request, or joins the one in flight.
 *
 * @param session - The provider session.
 * @returns The shared request outcome.
 * @example
 * ```ts
 * // Two calls in one tick make one request("screen") call.
 * await Promise.all([acquire(session), acquire(session)]);
 * ```
 */
function acquire(session: WakeLockSession): Promise<SystemResult<void>> {
  session.pending ??= requestLock(session).finally(() => {
    session.pending = undefined;
  });
  return session.pending;
}

/**
 * `set(true)`: records the wish, then takes the lock unless it is held or the page is hidden.
 *
 * @param session - The provider session.
 * @returns ok when the lock is held, otherwise a typed failure.
 * @example
 * ```ts
 * // A hidden page: the wish is kept and the lock comes when the page is visible again.
 * await holdScreen(session); // { ok: false, reason: "unavailable", message: HIDDEN_MESSAGE, … }
 * ```
 */
async function holdScreen(session: WakeLockSession): Promise<SystemResult<void>> {
  if (session.disposed) {
    return err(session.kind, "unavailable", STOPPED_MESSAGE);
  }

  session.wanted = true;
  if (session.sentinel !== undefined) {
    return ok(undefined, session.kind);
  }

  if (isPageHidden(session)) {
    return err(session.kind, "unavailable", HIDDEN_MESSAGE);
  }

  return acquire(session);
}

/**
 * `set(false)`: drops the wish and releases the held lock.
 *
 * @param session - The provider session.
 * @returns ok, also when nothing was held.
 * @example
 * ```ts
 * await releaseScreen(session); // { ok: true, value: undefined, provider: "web" }, held or not
 * ```
 */
async function releaseScreen(session: WakeLockSession): Promise<SystemResult<void>> {
  session.wanted = false;
  await releaseHeldLock(session);
  return ok(undefined, session.kind);
}

/**
 * `visibilitychange` handler: takes the lock again when the page is visible, the wish holds and
 * the browser dropped the lock. A failure is logged at warn, never thrown.
 *
 * @param session - The provider session.
 * @example
 * ```ts
 * // The page is back after the browser dropped the lock: one request("screen") follows.
 * reacquireWhenVisible(session);
 * ```
 */
function reacquireWhenVisible(session: WakeLockSession): void {
  if (isPageHidden(session) || !session.wanted || session.sentinel !== undefined) {
    return;
  }

  acquire(session).then(result => {
    if (!result.ok) {
      session.log.warn("keepAwake:reacquire-failed", {
        reason: result.reason,
        message: result.message
      });
    }
  });
}

/**
 * Teardown: stops following visibility, drops the wish and releases the held lock.
 *
 * @param session - The provider session.
 * @param onVisibilityChange - The listener the factory registered.
 * @returns Resolves once the held lock is released.
 * @example
 * ```ts
 * await disposeSession(session, onVisibilityChange);
 * await holdScreen(session); // { ok: false, reason: "unavailable", message: "app stopped", … }
 * ```
 */
async function disposeSession(
  session: WakeLockSession,
  onVisibilityChange: () => void
): Promise<void> {
  session.disposed = true;
  session.wanted = false;
  session.document?.removeEventListener("visibilitychange", onVisibilityChange);
  await releaseHeldLock(session);
}

/**
 * Creates the keep-awake provider over `navigator.wakeLock`. The same code serves `"web"` and
 * `"tauri"`; `kind` only tags the results. Without the API it returns the shared unsupported
 * stand-in.
 *
 * The provider keeps the wish, the held lock and one in-flight request. The browser drops the
 * lock when the page hides; a `visibilitychange` back to visible takes it again while the wish
 * holds.
 *
 * @param kind - The runtime kind every result reports.
 * @param log - `ctx.log` for request and release failures (MC2).
 * @returns The keep-awake provider.
 * @example
 * ```ts
 * // Inside a Tauri webview the browser API holds the lock: no native plugin is involved.
 * const provider = createWakeLockProvider("tauri", ctx.log);
 * await provider.set(true); // { ok: true, value: undefined, provider: "tauri" }
 * ```
 */
export function createWakeLockProvider(kind: RuntimeKind, log: LogApi): KeepAwakeProvider {
  const wakeLock = readWakeLock();
  if (wakeLock === undefined) {
    return unsupportedProvider(kind, KEEP_AWAKE_METHODS);
  }

  const session: WakeLockSession = {
    kind,
    log,
    wakeLock,
    document: readDocument(),
    wanted: false,
    disposed: false,
    sentinel: undefined,
    pending: undefined
  };

  /**
   * The `visibilitychange` listener for this session. Dispose removes this exact function.
   *
   * @example
   * ```ts
   * session.document?.addEventListener("visibilitychange", onVisibilityChange);
   * ```
   */
  const onVisibilityChange = (): void => {
    reacquireWhenVisible(session);
  };
  session.document?.addEventListener("visibilitychange", onVisibilityChange);

  return {
    /**
     * Holds (`true`) or releases (`false`) the screen wake lock.
     *
     * @param on - `true` to keep the screen on, `false` to let it sleep.
     * @returns ok, or a typed failure.
     * @example
     * ```ts
     * await provider.set(true); // { ok: true, value: undefined, provider: "tauri" } when visible
     * ```
     */
    set: on => (on ? holdScreen(session) : releaseScreen(session)),

    /**
     * Teardown: removes the visibility listener, releases a held lock and drops the wish.
     *
     * @returns Resolves once the lock is released.
     * @example
     * ```ts
     * await provider.dispose(); // a later provider.set(true) answers "unavailable", "app stopped"
     * ```
     */
    dispose: () => disposeSession(session, onVisibilityChange)
  };
}
