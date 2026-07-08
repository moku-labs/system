/**
 * @file store plugin — state factory skeleton.
 */
import type { StoreConfig, StoreState } from "./types";

/**
 * Creates the initial store state: an empty resolution slot (provider: null) that
 * onStart populates via startResolution.
 *
 * @param {object} _ctx - Minimal context.
 * @param {object} _ctx.global - Frozen global config.
 * @param {object} _ctx.config - Resolved store config.
 * @example
 * ```ts
 * const state = createStoreState({ global: {}, config: { name: "moku-system" } });
 * ```
 */
export function createStoreState(_ctx: {
  readonly global: Readonly<Record<string, unknown>>;
  readonly config: Readonly<StoreConfig>;
}): StoreState {
  throw new Error("not implemented");
}
