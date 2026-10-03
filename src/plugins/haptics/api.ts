/**
 * @file haptics plugin — API factory. Every method waits for the resolution slot, then hands
 * the call to the selected provider. The consumer contract lives on HapticsApi in types.ts.
 */
import { awaitProvider } from "../runtime/provider";
import type { SystemResult } from "../runtime/result";
import type { HapticsProvider } from "./providers/types";
import type { HapticsApi, HapticsContext } from "./types";

/**
 * Wait for the provider, then play one haptic on it. A not-started app or a failed resolution
 * answers its failure and plays nothing.
 *
 * @param ctx - Haptics domain context (state + runtime).
 * @param play - The provider call to make.
 * @returns The provider's result, or the resolution failure.
 * @example
 * ```ts
 * // On the web, before app.start(): nothing is played.
 * await withProvider(ctx, provider => provider.impact("light"));
 * // { ok: false, provider: "web", reason: "unavailable", message: "app not started — call app.start() first" }
 * ```
 */
async function withProvider(
  ctx: HapticsContext,
  play: (provider: HapticsProvider) => Promise<SystemResult<void>>
): Promise<SystemResult<void>> {
  const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
  if (!resolved.ok) {
    return resolved.failure;
  }

  return play(resolved.provider);
}

/**
 * Build the haptics API mounted at `app.haptics`.
 *
 * @param ctx - Haptics domain context (state + runtime + log).
 * @returns The haptics API.
 * @example
 * ```ts
 * // The kernel mounts it through `api: createHapticsApi`; the app calls it as app.haptics.
 * await app.haptics.selection(); // { ok: false, provider: "tauri", reason: "unsupported" } on macOS
 * ```
 */
export function createHapticsApi(ctx: HapticsContext): HapticsApi {
  return {
    /**
     * Play an impact tap of the given strength on the resolved provider.
     *
     * @param kind - The tap strength.
     * @returns The provider's result, or the resolution failure.
     * @example
     * ```ts
     * await app.haptics.impact("heavy"); // { ok: true, value: undefined, provider: "tauri" } on a phone
     * ```
     */
    impact: kind => withProvider(ctx, provider => provider.impact(kind)),

    /**
     * Play the pattern for an outcome on the resolved provider.
     *
     * @param kind - The outcome.
     * @returns The provider's result, or the resolution failure.
     * @example
     * ```ts
     * await app.haptics.notify("success"); // { ok: true, value: undefined, provider: "tauri" } on a phone
     * ```
     */
    notify: kind => withProvider(ctx, provider => provider.notify(kind)),

    /**
     * Play the selection-changed tick on the resolved provider.
     *
     * @returns The provider's result, or the resolution failure.
     * @example
     * ```ts
     * await app.haptics.selection(); // { ok: false, provider: "web", reason: "unsupported" } in iOS Safari
     * ```
     */
    selection: () => withProvider(ctx, provider => provider.selection())
  };
}
