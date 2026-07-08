/**
 * @file Resolution-lifecycle helper — INTERNAL seam module (not exported from src/index.ts).
 * Owns fire-and-forget provider loading (rejections folded, never a sync onStart throw,
 * spec/06 §3/§5) and the per-app teardown registry. The registry is keyed by the app's
 * FROZEN GLOBAL CONFIG object: ctx.global is frozen once per createApp (spec/06 §2 step 5)
 * and present in both onStart (PluginContext) and onStop (TeardownContext = { global }),
 * so it is a phase-legitimate per-app-instance key (D-009).
 */
import type { RuntimeKind, SystemErr as SystemError } from "./result";

/** Every capability provider must expose teardown (plan-checker F3). */
export type CapabilityProvider = { dispose: () => Promise<void> };

/** Outcome of a finished resolution — a usable provider or a folded failure. */
export type ResolvedProvider<P extends CapabilityProvider> =
  | { ok: true; provider: P }
  | { ok: false; failure: SystemError };

/** The state slot every capability plugin embeds. null until onStart runs. */
export type ResolutionState<P extends CapabilityProvider> = {
  provider: Promise<ResolvedProvider<P>> | null;
};

/**
 * Kick off fire-and-forget provider resolution from a capability's onStart.
 * Synchronously stores an unawaited promise in ctx.state.provider; folds every load()
 * rejection into the promise as an "unavailable" failure; registers the teardown entry;
 * disposes a late-arriving provider if the app already stopped.
 *
 * @param {string} _capability - Plugin name (registry key within the app).
 * @param {RuntimeKind} _kind - Selected provider kind (for failure results).
 * @param {object} _ctx - onStart context slice: { global, state }.
 * @param {object} _ctx.global - Frozen global config (per-app registry key).
 * @param {object} _ctx.state - The capability's resolution slot.
 * @param {() => Promise<P>} _load - Async provider factory; selection happens inside it.
 * @example
 * ```ts
 * onStart: (ctx) => { startResolution("store", ctx.runtime.kind, ctx, loadStoreProvider(ctx)); }
 * ```
 */
export function startResolution<P extends CapabilityProvider>(
  _capability: string,
  _kind: RuntimeKind,
  _ctx: { readonly global: object; state: ResolutionState<P> },
  _load: () => Promise<P>
): void {
  throw new Error("not implemented");
}

/**
 * Teardown from a capability's onStop (TeardownContext — { global } only).
 * Flips the stopped sentinel and awaits the resolved provider's dispose().
 *
 * @param {string} _capability - Plugin name used at startResolution.
 * @param {object} _ctx - Teardown context: { global }.
 * @param {object} _ctx.global - Frozen global config (per-app registry key).
 * @example
 * ```ts
 * onStop: (ctx) => stopResolution("store", ctx)
 * ```
 */
export function stopResolution(
  _capability: string,
  _ctx: { readonly global: object }
): Promise<void> {
  throw new Error("not implemented");
}

/**
 * Await the resolved provider from an API method. A null slot (app never started)
 * resolves to an "unavailable" failure instead of throwing.
 *
 * @param {ResolutionState<P>} _state - The capability's state slot.
 * @param {RuntimeKind} _kind - Active kind (for the not-started failure).
 * @example
 * ```ts
 * const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
 * if (!resolved.ok) return resolved.failure;
 * ```
 */
export function awaitProvider<P extends CapabilityProvider>(
  _state: ResolutionState<P>,
  _kind: RuntimeKind
): Promise<ResolvedProvider<P>> {
  throw new Error("not implemented");
}
