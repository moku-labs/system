/**
 * @file back plugin — type definitions. Provider interface types are STRUCTURAL and
 * local (never re-export `@tauri-apps/*` types — .d.mts leakage guard).
 */

import type { LogApi } from "@moku-labs/common";
import type { PluginCtx } from "@moku-labs/core";
import type { Config } from "../../config";
import type { ResolutionState } from "../runtime/provider";
import type { SystemResult } from "../runtime/result";
import type { RuntimeApi } from "../runtime/types";
import type { BackProvider } from "./providers/types";

/**
 * Removes the handler `onPress` registered. A second call does nothing.
 *
 * @example
 * ```ts
 * const off: Unsubscribe = app.back.onPress(() => closePopup());
 * off(); // the handler is gone
 * ```
 */
export type Unsubscribe = () => void;

/**
 * Internal back state — the resolution slot, the handler stack, and the bookkeeping that
 * keeps the native Back listener in step with it (D-S04).
 */
export type BackState = ResolutionState<BackProvider> & {
  /** `onPress` handlers, oldest first. A press walks them from the end: newest first. */
  handlers: Array<() => boolean>;
  /** Whether the native listener is registered. True only after `listen` resolved ok. */
  listening: boolean;
  /** Tail of the reconcile queue. Never rejects, so one failed step cannot block the next. */
  queue: Promise<void>;
};

/**
 * Internal domain context — global/runtime/log extensions (spec/15 §6; not part of the public contract).
 */
export type BackContext = PluginCtx<Record<string, never>, BackState> & {
  readonly global: Readonly<Config>;
  readonly runtime: RuntimeApi;
  readonly log: LogApi;
};

/**
 * Hardware Back API. Only Tauri Android has a hardware Back: there handlers run on a press
 * and `exit()` closes the app. Web and the other Tauri platforms keep the handlers, never
 * call them, and answer `exit()` with `err("unsupported")`.
 */
export type BackApi = {
  /**
   * Registers a handler for the hardware Back press. The handler returns `true` when it
   * took the press. Handlers run newest first, and the first `true` stops the chain. When
   * no handler takes the press, the platform default runs: the webview goes back, or the
   * app closes when there is no history. A handler that throws is logged and counts as
   * `false`. Local and synchronous: it works before `app.start()` and always succeeds.
   * The native listener exists only while at least one handler does, so removing the last
   * handler gives Back back to the system.
   *
   * @param {() => boolean} fn - Press handler. Returns whether it took the press.
   * @returns {Unsubscribe} Removes this registration only.
   * @example
   * ```ts
   * // A popup is open: Back closes it instead of leaving the screen.
   * const off = app.back.onPress(() => {
   *   closePopup();
   *   return true; // taken: older handlers and the system default do not run
   * });
   * off(); // popup gone: with no handler left, the system Back works again
   * ```
   */
  onPress: (fn: () => boolean) => Unsubscribe;
  /**
   * Closes the app. On Tauri Android it calls `exit(0)` from `@tauri-apps/api/app`, which
   * finishes the activity. A refused call (the `core:app:allow-exit` permission is missing)
   * answers `err("tauri", "error", message)`. Everywhere else it answers `err(kind, "unsupported")`.
   *
   * @returns {Promise<SystemResult<void>>} ok once the exit was requested.
   * @example
   * ```ts
   * // The menu's Quit button. Only Tauri Android can close the app.
   * const result = await app.back.exit();
   * // web, iOS, desktop: { ok: false, provider: "web" | "tauri", reason: "unsupported" }
   * if (!result.ok && result.reason === "unsupported") hideQuitButton();
   * ```
   */
  exit: () => Promise<SystemResult<void>>;
};
