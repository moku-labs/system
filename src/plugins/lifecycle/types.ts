/**
 * @file lifecycle plugin — type definitions. Provider types are STRUCTURAL and local (never
 * re-export `@tauri-apps/*` types — .d.mts leakage guard).
 */

import type { LogApi } from "@moku-labs/common";
import type { PluginCtx } from "@moku-labs/core";
import type { Config } from "../../config";
import type { ResolutionState } from "../runtime/provider";
import type { RuntimeApi } from "../runtime/types";
import type { LifecycleProvider } from "./providers/types";

/**
 * Removes one `onPause` / `onResume` subscription.
 *
 * @example
 * ```ts
 * const offPause: Unsubscribe = app.lifecycle.onPause(() => game.pause());
 * offPause(); // going to background no longer pauses the game
 * ```
 */
export type Unsubscribe = () => void;

/**
 * Internal lifecycle state — the resolution slot, the last transition and the two subscriber
 * sets.
 */
export type LifecycleState = ResolutionState<LifecycleProvider> & {
  /** Whether the last transition was a pause. Starts false; only the signal flips it. */
  paused: boolean;
  /** `onPause()` callbacks, run once per pause transition. */
  pauseSubscribers: Set<() => void>;
  /** `onResume()` callbacks, run once per resume transition. */
  resumeSubscribers: Set<() => void>;
};

/**
 * Internal domain context — global/runtime/log extensions (spec/15 §6; not part of the public contract).
 */
export type LifecycleContext = PluginCtx<Record<string, never>, LifecycleState> & {
  readonly global: Readonly<Config>;
  readonly runtime: RuntimeApi;
  readonly log: LogApi;
};

/**
 * Lifecycle API — run code when the app goes to background and when it comes back. Web: the
 * page's `visibilitychange`. Tauri: the same, plus the native `tauri://suspended` /
 * `tauri://resumed` events. Each trip is reported once, however many sources see it.
 *
 * @example
 * ```ts
 * app.lifecycle.onPause(() => game.pause());
 * app.lifecycle.onResume(() => game.resume());
 * ```
 */
export type LifecycleApi = {
  /**
   * Runs `fn` each time the app goes to background: the tab or window is hidden, or the OS
   * suspends the app. Local and synchronous, always succeeds. Allowed before `app.start()`;
   * `fn` starts firing once the provider is wired. One trip to background calls `fn` once, even
   * when two sources report it. A `fn` that throws is logged (`lifecycle:subscriber-failed`) and
   * the other subscribers still run. Each call is its own subscription: the same `fn` subscribed
   * twice runs twice per trip, and each remover removes one of the two.
   *
   * @param {() => void} fn - Called on every pause.
   * @returns {Unsubscribe} Removes this subscription only.
   * @example
   * ```ts
   * // Freeze the game loop while the player is in another app.
   * const offPause = app.lifecycle.onPause(() => game.pause());
   * offPause(); // later trips to background no longer call game.pause()
   * ```
   */
  onPause: (fn: () => void) => Unsubscribe;
  /**
   * Runs `fn` each time the app comes back to the foreground. Every resume follows a pause: an
   * app that never went to background never reports a resume. Local and synchronous, always
   * succeeds; same subscription rules as `onPause`.
   *
   * @param {() => void} fn - Called on every resume.
   * @returns {Unsubscribe} Removes this subscription only.
   * @example
   * ```ts
   * // Restart the game loop when the player comes back.
   * const offResume = app.lifecycle.onResume(() => game.resume());
   * offResume(); // coming back no longer calls game.resume()
   * ```
   */
  onResume: (fn: () => void) => Unsubscribe;
};
