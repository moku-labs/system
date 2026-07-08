/**
 * @file tray plugin — state factory skeleton.
 */
import type { TrayConfig, TrayState } from "./types";

/**
 * Creates the initial tray state: an empty resolution slot (provider: null) that
 * onStart populates via startResolution.
 *
 * @param {object} _ctx - Minimal context.
 * @param {object} _ctx.global - Frozen global config.
 * @param {object} _ctx.config - Resolved tray config.
 * @example
 * ```ts
 * const state = createTrayState({ global: {}, config: { id: "moku-system" } });
 * ```
 */
export function createTrayState(_ctx: {
  readonly global: Readonly<Record<string, unknown>>;
  readonly config: Readonly<TrayConfig>;
}): TrayState {
  throw new Error("not implemented");
}
