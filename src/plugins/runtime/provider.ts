/**
 * @file Resolution-lifecycle helper — INTERNAL seam module (not exported from src/index.ts).
 * Owns fire-and-forget provider loading (rejections folded, never a sync onStart throw,
 * spec/06 §3/§5) and the per-app teardown registry. The registry is keyed by the app's
 * FROZEN GLOBAL CONFIG object: ctx.global is frozen once per createApp (spec/06 §2 step 5)
 * and present in both onStart (PluginContext) and onStop (TeardownContext = { global }),
 * so it is a phase-legitimate per-app-instance key (D-009).
 */

import type { RuntimeKind, SystemErr as SystemError } from "./result";
import { err, mapThrownToResult } from "./result";

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

/** Bookkeeping entry for one capability's in-flight or completed resolution. */
type TeardownEntry = {
  stopped: boolean;
  dispose: (() => Promise<void>) | null;
  /**
   * The folded resolution chain (never rejects — startResolution catches into a failure
   * result). stopResolution awaits it so teardown covers a resolution still in flight.
   */
  settled: Promise<ResolvedProvider<CapabilityProvider>> | null;
};

/**
 * Per-app teardown registries, keyed by the app's frozen global config object
 * (decision D-009) so multiple app instances never share resolution state.
 */
const registries = new WeakMap<object, Map<string, TeardownEntry>>();

/**
 * Get (or lazily create) the teardown registry for one app instance.
 *
 * @param {object} appGlobal - The app's frozen global config (per-app registry key).
 * @returns The capability-keyed teardown registry for this app.
 * @example
 * ```ts
 * const registry = getRegistry(ctx.global);
 * ```
 */
function getRegistry(appGlobal: object): Map<string, TeardownEntry> {
  const existing = registries.get(appGlobal);
  if (existing !== undefined) {
    return existing;
  }
  const created = new Map<string, TeardownEntry>();
  registries.set(appGlobal, created);
  return created;
}

/**
 * Kick off fire-and-forget provider resolution from a capability's onStart.
 * Synchronously stores an unawaited promise in ctx.state.provider; folds every load()
 * rejection into the promise as an "unavailable" failure; registers the teardown entry;
 * disposes a late-arriving provider if the app already stopped.
 *
 * @param {string} capability - Plugin name (registry key within the app).
 * @param {RuntimeKind} kind - Selected provider kind (for failure results).
 * @param {object} ctx - onStart context slice: { global, state }.
 * @param {object} ctx.global - Frozen global config (per-app registry key).
 * @param {object} ctx.state - The capability's resolution slot.
 * @param {() => Promise<P>} load - Async provider factory; selection happens inside it.
 * @example
 * ```ts
 * onStart: (ctx) => { startResolution("store", ctx.runtime.kind, ctx, loadStoreProvider(ctx)); }
 * ```
 */
export function startResolution<P extends CapabilityProvider>(
  capability: string,
  kind: RuntimeKind,
  ctx: { readonly global: object; state: ResolutionState<P> },
  load: () => Promise<P>
): void {
  const registry = getRegistry(ctx.global);
  const entry: TeardownEntry = {
    stopped: false,
    // eslint-disable-next-line unicorn/no-null -- dispose is null until the provider resolves (TeardownEntry contract)
    dispose: null,
    // eslint-disable-next-line unicorn/no-null -- settled is null until the chain below is built (TeardownEntry contract)
    settled: null
  };
  registry.set(capability, entry);

  const resolution = load()
    .then(async (provider): Promise<ResolvedProvider<P>> => {
      if (entry.stopped) {
        await provider.dispose();
        return { ok: false, failure: err(kind, "unavailable", "stopped during resolution") };
      }
      entry.dispose = provider.dispose.bind(provider);
      return { ok: true, provider };
    })
    .catch(
      (error: unknown): ResolvedProvider<P> => ({
        ok: false,
        failure: mapThrownToResult(kind, error, "unavailable")
      })
    );

  entry.settled = resolution;
  ctx.state.provider = resolution;
}

/**
 * Teardown from a capability's onStop (TeardownContext — { global } only).
 * Flips the stopped sentinel, awaits an in-flight resolution (so a late-arriving
 * provider is disposed before app.stop() resolves — its load() rejection is already
 * folded into a failure result, never rethrown here), then awaits the resolved
 * provider's dispose().
 *
 * @param {string} capability - Plugin name used at startResolution.
 * @param {object} ctx - Teardown context: { global }.
 * @param {object} ctx.global - Frozen global config (per-app registry key).
 * @returns A promise that resolves once teardown completes.
 * @example
 * ```ts
 * onStop: (ctx) => stopResolution("store", ctx)
 * ```
 */
export async function stopResolution(
  capability: string,
  ctx: { readonly global: object }
): Promise<void> {
  const registry = registries.get(ctx.global);
  const entry = registry?.get(capability);
  if (entry === undefined) {
    return;
  }
  // Set before awaiting: the sentinel is what makes a resolution finishing after this
  // point dispose its provider instead of installing it.
  entry.stopped = true;
  await entry.settled;
  await entry.dispose?.();
  registry?.delete(capability);
}

/**
 * Await the resolved provider from an API method. A null slot (app never started)
 * resolves to an "unavailable" failure instead of throwing.
 *
 * @param {ResolutionState<P>} state - The capability's state slot.
 * @param {RuntimeKind} kind - Active kind (for the not-started failure).
 * @returns The resolved provider outcome, or an "app not started" failure.
 * @example
 * ```ts
 * const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
 * if (!resolved.ok) return resolved.failure;
 * ```
 */
export function awaitProvider<P extends CapabilityProvider>(
  state: ResolutionState<P>,
  kind: RuntimeKind
): Promise<ResolvedProvider<P>> {
  if (state.provider === null) {
    return Promise.resolve({
      ok: false,
      failure: err(kind, "unavailable", "app not started — call app.start() first")
    });
  }
  return state.provider;
}
