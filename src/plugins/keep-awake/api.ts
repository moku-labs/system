/**
 * @file keepAwake plugin — API factory. `set` awaits the resolution slot and hands the wish to the
 * provider. Every answer is a SystemResult.
 */
import { awaitProvider } from "../runtime/provider";
import type { KeepAwakeApi, KeepAwakeContext } from "./types";

/**
 * Builds the keepAwake API mounted at `app.keepAwake`. Before `app.start()` every call answers
 * `"unavailable"`; after a failed resolution every call answers the stored failure.
 *
 * @param ctx - keepAwake domain context (state + runtime).
 * @returns The keepAwake API.
 * @example
 * ```ts
 * // Wired by the plugin spec as `api: createKeepAwakeApi`, mounted at app.keepAwake.
 * await app.keepAwake.set(true); // { ok: true, value: undefined, provider: "web" }
 * ```
 */
export function createKeepAwakeApi(ctx: KeepAwakeContext): KeepAwakeApi {
  return {
    /**
     * Awaits the resolved provider and hands it the wish.
     *
     * @param on - `true` to keep the screen on, `false` to let it sleep.
     * @returns The provider's answer, or the not-started or resolution failure.
     * @example
     * ```ts
     * await app.keepAwake.set(true); // before app.start(): reason "unavailable"
     * ```
     */
    set: async on => {
      const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
      if (!resolved.ok) {
        return resolved.failure;
      }

      return resolved.provider.set(on);
    }
  };
}
