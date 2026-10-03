/**
 * @file haptics plugin — type definitions. The public contract lives on {@link HapticsApi}.
 * Provider types are structural and local: no `@tauri-apps/*` type is re-exported, so none
 * leaks into the emitted `.d.mts`.
 */

import type { LogApi } from "@moku-labs/common";
import type { PluginCtx } from "@moku-labs/core";
import type { Config } from "../../config";
import type { ResolutionState } from "../runtime/provider";
import type { SystemResult } from "../runtime/result";
import type { RuntimeApi } from "../runtime/types";
import type { HapticsProvider } from "./providers/types";

/**
 * How strong an impact tap is. These are the three styles every platform can tell apart:
 * iOS maps them to `UIImpactFeedbackGenerator`, Android and the web play a longer pulse per
 * step.
 *
 * @example
 * ```ts
 * const landing: ImpactKind = "heavy";
 * ```
 */
export type ImpactKind = "light" | "medium" | "heavy";

/**
 * The outcome a notification haptic conveys.
 *
 * @example
 * ```ts
 * const outcome: NotifyKind = "warning";
 * ```
 */
export type NotifyKind = "success" | "warning" | "error";

/**
 * Internal haptics state: the resolution slot only. `onStart` fills it.
 */
export type HapticsState = ResolutionState<HapticsProvider>;

/**
 * Internal domain context: the plugin context plus the injected `runtime` and `log` core APIs
 * (spec/15 §6; not part of the public contract).
 */
export type HapticsContext = PluginCtx<Record<string, never>, HapticsState> & {
  readonly global: Readonly<Config>;
  readonly runtime: RuntimeApi;
  readonly log: LogApi;
};

/**
 * Haptic feedback at `app.haptics`. Every method answers a `SystemResult` and never throws.
 * Tauri iOS and Android play the native haptic. A browser with `navigator.vibrate` plays a
 * short pattern. Tauri desktop and browsers without `vibrate` (iOS Safari, WKWebView) answer
 * `"unsupported"`.
 *
 * @example
 * ```ts
 * const r = await app.haptics.impact("light");
 * if (!r.ok && r.reason === "unsupported") hideHapticsToggle();
 * ```
 */
export type HapticsApi = {
  /**
   * Plays one tap for a physical moment: a card lands, a switch snaps, two pieces collide.
   * On the web the tap is a 10, 20 or 35 ms pulse. A browser that refuses `vibrate` before
   * the first user gesture answers `"unavailable"`.
   *
   * @param kind - The tap strength: `"light"`, `"medium"` or `"heavy"`.
   * @returns ok once the tap is played, or a typed failure.
   * @example
   * ```ts
   * // The dragged card lands on the pile.
   * await app.haptics.impact("medium"); // { ok: true, value: undefined, provider: "tauri" } on a phone
   * ```
   */
  impact: (kind: ImpactKind) => Promise<SystemResult<void>>;

  /**
   * Plays the pattern for the outcome of a task. On the web: success `[15, 60, 15]`, warning
   * `[30, 60, 30]`, error `[40, 60, 40, 60, 40]` ms. Before the first user gesture a browser
   * refuses `vibrate` and the result is `"unavailable"`.
   *
   * @param kind - The outcome: `"success"`, `"warning"` or `"error"`.
   * @returns ok once the pattern is played, or a typed failure.
   * @example
   * ```ts
   * // The level is cleared.
   * const r = await app.haptics.notify("success");
   * if (!r.ok && r.reason === "unavailable") showHint("Tap once to turn on vibration");
   * ```
   */
  notify: (kind: NotifyKind) => Promise<SystemResult<void>>;

  /**
   * Plays the short tick for a changed selection, such as a picker wheel moving one step.
   * On the web the tick is a 5 ms pulse.
   *
   * @returns ok once the tick is played, or a typed failure.
   * @example
   * ```ts
   * // The picker wheel moved to the next value.
   * await app.haptics.selection(); // { ok: false, provider: "web", reason: "unsupported" } in iOS Safari
   * ```
   */
  selection: () => Promise<SystemResult<void>>;
};
