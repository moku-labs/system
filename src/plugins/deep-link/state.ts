/**
 * @file deep-link plugin — state factory skeleton.
 */
import type { DeepLinkConfig, DeepLinkState } from "./types";

/**
 * Creates the initial deep-link state: an empty resolution slot plus the dedup guard
 * (lastUrl: null) and an empty subscriber set.
 *
 * @param {object} _ctx - Minimal context.
 * @param {object} _ctx.global - Frozen global config.
 * @param {object} _ctx.config - Resolved deep-link config.
 * @example
 * ```ts
 * const state = createDeepLinkState({ global: {}, config: { schemes: [] } });
 * ```
 */
export function createDeepLinkState(_ctx: {
  readonly global: Readonly<Record<string, unknown>>;
  readonly config: Readonly<DeepLinkConfig>;
}): DeepLinkState {
  throw new Error("not implemented");
}
