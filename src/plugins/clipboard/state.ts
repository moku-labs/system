/**
 * @file clipboard plugin — state factory skeleton.
 */
import type { ClipboardState } from "./types";

/**
 * Creates the initial clipboard state: an empty resolution slot (provider: null) that
 * onStart populates via startResolution.
 *
 * @param {object} _ctx - Minimal context.
 * @param {object} _ctx.global - Frozen global config.
 * @param {object} _ctx.config - Resolved (empty) clipboard config.
 * @example
 * ```ts
 * const state = createClipboardState({ global: {}, config: {} });
 * ```
 */
export function createClipboardState(_ctx: {
  readonly global: Readonly<Record<string, unknown>>;
  readonly config: Readonly<Record<string, never>>;
}): ClipboardState {
  throw new Error("not implemented");
}
