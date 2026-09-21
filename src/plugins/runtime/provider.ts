/**
 * @file Resolution-lifecycle helper — INTERNAL seam module (not exported from src/index.ts).
 * Owns fire-and-forget provider loading (rejections folded, never a sync onStart throw,
 * spec/06 §3/§5) and the teardown bookkeeping. The bookkeeping lives in the capability's
 * OWN plugin state: since kernel 1.6 onStop receives { global, config, state },
 * so teardown reads the entry onStart wrote there and no module-scope registry is needed.
 */

import type { LogApi } from "@moku-labs/common";

import type { RuntimeKind, SystemErr as SystemError } from "./result";
import { err, mapThrownToResult } from "./result";

/** How long stopResolution waits for an in-flight resolution before it stops waiting. */
const STOP_TIMEOUT_MS = 5000;

/**
 * Rejection texts a bundler or runtime produces when a module specifier cannot be
 * resolved at all — as opposed to a fault raised by a module that did load.
 */
const MISSING_MODULE_PATTERN =
  /cannot find (?:module|package)|module not found|failed to (?:fetch|load|resolve) (?:dynamically imported )?module|failed to resolve (?:import|module specifier)|importing a module script failed/i;

/** Every capability provider must expose teardown (plan-checker F3). */
export type CapabilityProvider = { dispose: () => Promise<void> };

/** Outcome of a finished resolution — a usable provider or a folded failure. */
export type ResolvedProvider<P extends CapabilityProvider> =
  | { ok: true; provider: P }
  | { ok: false; failure: SystemError };

/** Bookkeeping entry for one capability's in-flight or completed resolution. */
export type TeardownEntry = {
  stopped: boolean;
  dispose: (() => Promise<void>) | null;
  /**
   * The folded resolution chain (never rejects — startResolution catches into a failure
   * result). stopResolution awaits it so teardown covers a resolution still in flight.
   */
  settled: Promise<ResolvedProvider<CapabilityProvider>> | null;
  /**
   * The capability's logger, captured at startResolution. onStop's TeardownContext is
   * `{ global, config, state }` (spec/06 §3): it carries no core plugin APIs, so teardown
   * has no ctx.log of its own — and family convention MC2 forbids reaching for console.
   */
  log: LogApi;
};

/**
 * The state slot every capability plugin embeds. `provider` is null until onStart runs.
 * `teardown` is absent until startResolution writes it, and removed again by stopResolution.
 */
export type ResolutionState<P extends CapabilityProvider> = {
  provider: Promise<ResolvedProvider<P>> | null;
  teardown?: TeardownEntry;
};

/**
 * Kick off fire-and-forget provider resolution from a capability's onStart.
 * Synchronously stores an unawaited promise in ctx.state.provider; folds every load()
 * rejection into the promise as an "unavailable" failure; writes the teardown entry into
 * ctx.state.teardown; disposes a late-arriving provider if the app already stopped.
 *
 * @param {RuntimeKind} kind - Selected provider kind (for failure results).
 * @param {object} ctx - onStart context slice: { state, log }.
 * @param {object} ctx.state - The capability's resolution slot.
 * @param {LogApi} ctx.log - The capability's logger, kept for teardown (MC2).
 * @param {() => Promise<P>} load - Async provider factory; selection happens inside it.
 * @example
 * ```ts
 * onStart: (ctx) => { startResolution(ctx.runtime.kind, ctx, loadStoreProvider(ctx)); }
 * ```
 */
export function startResolution<P extends CapabilityProvider>(
  kind: RuntimeKind,
  ctx: { state: ResolutionState<P>; readonly log: LogApi },
  load: () => Promise<P>
): void {
  const entry: TeardownEntry = {
    stopped: false,
    // eslint-disable-next-line unicorn/no-null -- dispose is null until the provider resolves (TeardownEntry contract)
    dispose: null,
    // eslint-disable-next-line unicorn/no-null -- settled is null until the chain below is built (TeardownEntry contract)
    settled: null,
    log: ctx.log
  };
  ctx.state.teardown = entry;

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
 * Wait for a resolution to settle, but not forever.
 *
 * @param {Promise<unknown> | null} settled - The folded resolution chain; null when none started.
 * @param {number} timeoutMs - How long to wait before giving up.
 * @returns {Promise<boolean>} True when the resolution settled in time.
 * @example
 * ```ts
 * if (!(await settleWithin(entry.settled, 5000))) log.warn("…");
 * ```
 */
async function settleWithin(settled: Promise<unknown> | null, timeoutMs: number): Promise<boolean> {
  if (settled === null) {
    return true;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<boolean>(resolve => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([settled.then(() => true), expiry]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Teardown from a capability's onStop (TeardownContext — { global, config, state }).
 * Reads the entry startResolution wrote into the plugin's own state. Flips the stopped
 * sentinel, waits (bounded) for an in-flight resolution so a late-arriving provider is
 * disposed before app.stop() resolves — its load() rejection is already folded into a
 * failure result, never rethrown here — then awaits the resolved provider's dispose().
 *
 * The wait is bounded because a dynamic import that never settles would otherwise hang
 * app.stop() forever. On timeout the capability is logged at warn and teardown moves on;
 * the stopped sentinel outlives this call, so a provider arriving later still disposes
 * itself instead of installing into a stopped app.
 *
 * @param {string} capability - Plugin name, used in the timeout warning.
 * @param {object} ctx - Teardown context slice: { state }.
 * @param {object} ctx.state - The capability's resolution slot.
 * @param {number} [timeoutMs] - How long to wait for an in-flight resolution. Default 5000.
 * @returns A promise that resolves once teardown completes.
 * @example
 * ```ts
 * onStop: (ctx) => stopResolution("store", ctx)
 * ```
 */
export async function stopResolution<P extends CapabilityProvider>(
  capability: string,
  ctx: { state: ResolutionState<P> },
  timeoutMs: number = STOP_TIMEOUT_MS
): Promise<void> {
  const entry = ctx.state.teardown;
  if (entry === undefined) {
    return;
  }
  // Set before awaiting: the sentinel is what makes a resolution finishing after this
  // point dispose its provider instead of installing it.
  entry.stopped = true;

  if (!(await settleWithin(entry.settled, timeoutMs))) {
    entry.log.warn("runtime:stop-resolution-timeout", { capability, timeoutMs });
  }

  await entry.dispose?.();
  delete ctx.state.teardown;
}

/**
 * Whether a rejection means the module specifier could not be resolved at all, rather
 * than the loaded module itself failing. Bundlers and module runners usually re-wrap the
 * loader's error in one of their own, so the `cause` chain is walked (bounded) as well.
 *
 * @param {unknown} thrown - Whatever the dynamic import rejected with.
 * @param {number} [depth] - Remaining `cause` hops to inspect. Default 3.
 * @returns {boolean} True for a module-resolution failure.
 * @example
 * ```ts
 * if (isMissingModuleError(error)) reportMissingPeer();
 * ```
 */
function isMissingModuleError(thrown: unknown, depth = 3): boolean {
  if (typeof thrown === "object" && thrown !== null) {
    if ("code" in thrown && thrown.code === "ERR_MODULE_NOT_FOUND") {
      return true;
    }
    if (depth > 0 && "cause" in thrown && isMissingModuleError(thrown.cause, depth - 1)) {
      return true;
    }
  }
  return MISSING_MODULE_PATTERN.test(thrown instanceof Error ? thrown.message : String(thrown));
}

/**
 * Wrap a provider load closure so a missing optional `@tauri-apps/*` peer fails with a
 * message that NAMES the package and says how to get it. Without this the app sees a
 * raw bundler string ("Failed to fetch dynamically imported module …") folded into
 * "unavailable", which says nothing about which install is missing. Anything that is
 * not a module-resolution failure — a fault inside the provider itself — propagates
 * untouched.
 *
 * @param {string} nativeName - The capability's `@moku-labs/native` `config.system` entry
 *   name, which is the Tauri plugin name and not always this framework's plugin name
 *   (notify → `notification`, clipboard → `clipboard-manager`).
 * @param {string} peer - The npm package this capability's Tauri provider needs.
 * @param {() => Promise<P>} load - The load closure to wrap.
 * @returns {() => Promise<P>} The wrapped load closure.
 * @example
 * ```ts
 * return requirePeer("store", "@tauri-apps/plugin-store", async () => {
 *   const { createTauriStoreProvider } = await import("./tauri");
 *   return createTauriStoreProvider(ctx.config, ctx.log);
 * });
 * ```
 */
export function requirePeer<P>(
  nativeName: string,
  peer: string,
  load: () => Promise<P>
): () => Promise<P> {
  return async (): Promise<P> => {
    try {
      return await load();
    } catch (error) {
      if (!isMissingModuleError(error)) {
        throw error;
      }
      throw new Error(
        `${peer} is not installed. Add it to the app, or list "${nativeName}" in @moku-labs/native config.system.`
      );
    }
  };
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
