/**
 * @file keepAwake plugin — type definitions. The Screen Wake Lock shapes the provider reads stay
 * local to `providers/wake-lock.ts`. Nothing here names a DOM type or a Tauri package type.
 */

import type { LogApi } from "@moku-labs/common";
import type { PluginCtx } from "@moku-labs/core";
import type { Config } from "../../config";
import type { ResolutionState } from "../runtime/provider";
import type { SystemResult } from "../runtime/result";
import type { RuntimeApi } from "../runtime/types";
import type { KeepAwakeProvider } from "./providers/types";

/**
 * Internal keepAwake state: the resolution slot only. The wish, the held lock and an in-flight
 * request live in the provider, not here.
 */
export type KeepAwakeState = ResolutionState<KeepAwakeProvider>;

/**
 * Internal domain context: the plugin context plus the core APIs this plugin reads
 * (`ctx.runtime` for the kind, `ctx.log` for failures).
 */
export type KeepAwakeContext = PluginCtx<Record<string, never>, KeepAwakeState> & {
  readonly global: Readonly<Config>;
  readonly runtime: RuntimeApi;
  readonly log: LogApi;
};

/**
 * Keep-awake API mounted at `app.keepAwake`. One provider serves both kinds: the Screen Wake Lock
 * API (`navigator.wakeLock`) in a browser and inside the Tauri webview.
 */
export type KeepAwakeApi = {
  /**
   * Keeps the screen on (`true`) while the page is visible, or lets it sleep again (`false`).
   *
   * The wish outlives a hidden page. The browser drops the lock when the page hides, and the
   * plugin takes it again when the page is visible. On a hidden page `set(true)` answers
   * `"unavailable"` and keeps the wish. `"denied"` comes only from a `NotAllowedError`, for
   * example battery saver or a permissions policy. `"unsupported"` means there is no
   * `navigator.wakeLock`. `set(false)` answers ok, also when nothing was held. After
   * `app.stop()` the lock is released and `set(true)` answers `"unavailable"`.
   *
   * @param on - `true` to keep the screen on, `false` to let it sleep.
   * @returns ok once the lock is held or released, otherwise a typed failure.
   * @example
   * ```ts
   * // A level starts: keep the screen on while the player watches the board.
   * const r = await app.keepAwake.set(true); // { ok: true, value: undefined, provider: "web" }
   * if (!r.ok && r.reason === "denied") showHint("Battery saver blocks keep-awake");
   * await app.keepAwake.set(false); // the level ends: { ok: true, value: undefined, provider: "web" }
   * ```
   */
  set: (on: boolean) => Promise<SystemResult<void>>;
};
