/**
 * @file notify plugin — state factory skeleton.
 */
import type { NotifyState } from "./types";

/**
 * Creates the initial notify state: an empty resolution slot (provider: null) that
 * onStart populates via startResolution.
 *
 * @param {object} _ctx - Minimal context.
 * @param {object} _ctx.global - Frozen global config.
 * @param {object} _ctx.config - Resolved (empty) notify config.
 * @example
 * ```ts
 * const state = createNotifyState({ global: {}, config: {} });
 * ```
 */
export function createNotifyState(_ctx: {
  readonly global: Readonly<Record<string, unknown>>;
  readonly config: Readonly<Record<string, never>>;
}): NotifyState {
  throw new Error("not implemented");
}
