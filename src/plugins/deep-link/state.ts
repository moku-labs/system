/**
 * @file deep-link plugin — state factory. The resolution slot starts empty; onStart
 * populates it synchronously via startResolution (spec/02 §State). The launch phase
 * starts open with an empty handover record and no deadline — the deadline is set from
 * the injected clock at the first launch-phase URL; subscribers starts empty.
 */
import type { Config } from "../../config";
import type { DeepLinkConfig, DeepLinkState } from "./types";

/**
 * Creates the initial deep-link state: an empty resolution slot plus the launch-phase
 * handover record (open, empty, no deadline yet) and an empty subscriber set.
 *
 * @param {object} _ctx - Minimal context.
 * @param {object} _ctx.global - Frozen global config.
 * @param {object} _ctx.config - Resolved deep-link config.
 * @returns {DeepLinkState} The initial state with no resolved provider and no deliveries yet.
 * @example
 * ```ts
 * const state = createDeepLinkState({ global: {}, config: { schemes: [] } });
 * ```
 */
export function createDeepLinkState(_ctx: {
  readonly global: Readonly<Config>;
  readonly config: Readonly<DeepLinkConfig>;
}): DeepLinkState {
  return {
    // eslint-disable-next-line unicorn/no-null -- ResolutionState.provider is null until onStart (seam contract)
    provider: null,
    handedOver: new Map(),
    launchPhaseOpen: true,
    // eslint-disable-next-line unicorn/no-null -- the deadline is unknown until the first launch-phase URL
    launchPhaseEndsAt: null,
    subscribers: new Set()
  };
}
