/**
 * @file deep-link plugin — API factory, plus the delivery pipeline factory (filter →
 * launch handover → emit + notify) consumed by onStart's provider wiring.
 *
 * The launch handover is the symmetric half of `getCurrent()`: the OS listener and
 * `getCurrent()` both see the same launch URL, and neither can be relied on to run
 * first. Both paths consult one record (`state.handedOver`), so each launch URL reaches
 * the app exactly once, through whichever path sees it first.
 */
import { awaitProvider } from "../runtime/provider";
import type { SystemResult } from "../runtime/result";
import { ok } from "../runtime/result";
import type { Clock, DeepLinkApi, DeepLinkContext, DeepLinkState, Unsubscribe } from "./types";

const SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

/**
 * How long the launch phase lasts from the first launch-phase URL. Long enough to cover
 * a cold start plus the app's first `getCurrent()`, short enough that a user re-clicking
 * the same link is never mistaken for a launch replay.
 */
const LAUNCH_WINDOW_MS = 5000;

/**
 * Extract the lowercase URI scheme from a URL string (e.g. "myapp" from
 * "myapp://open?id=1"). Returns undefined when the string has no leading scheme.
 *
 * @param {string} url - The URL to inspect.
 * @returns {string | undefined} The lowercase scheme, or undefined when absent.
 * @example
 * ```ts
 * extractScheme("myapp://open"); // "myapp"
 * ```
 */
function extractScheme(url: string): string | undefined {
  const match = SCHEME_PATTERN.exec(url);
  return match?.[1]?.toLowerCase();
}

/**
 * Whether a URL passes the scheme allowlist. An empty allowlist accepts every URL.
 *
 * @param {readonly string[]} schemes - The configured scheme allowlist.
 * @param {string} url - The URL to check.
 * @returns {boolean} True when the URL's scheme is allowed (or the allowlist is empty).
 * @example
 * ```ts
 * isSchemeAllowed(["myapp"], "myapp://open"); // true
 * isSchemeAllowed(["myapp"], "other://open"); // false
 * ```
 */
function isSchemeAllowed(schemes: readonly string[], url: string): boolean {
  if (schemes.length === 0) {
    return true;
  }
  const scheme = extractScheme(url);
  return scheme !== undefined && schemes.includes(scheme);
}

/**
 * End the launch phase and drop the handover record. After this every delivery reaches
 * the app, however often the same URL arrives — a user re-clicking a link must work.
 *
 * @param {DeepLinkState} state - The deep-link state holding the record.
 * @example
 * ```ts
 * closeLaunchPhase(ctx.state);
 * ```
 */
function closeLaunchPhase(state: DeepLinkState): void {
  state.launchPhaseOpen = false;
  state.handedOver.clear();
}

/**
 * Whether the launch phase is still running. The deadline is set from the injected clock
 * at the first launch-phase URL and checked lazily here — no timer is ever armed, so the
 * plugin never keeps a runtime alive.
 *
 * @param {DeepLinkContext} ctx - Deep-link domain context.
 * @param {Clock} now - The injected millisecond clock.
 * @returns {boolean} True while launch URLs are still being handed over.
 * @example
 * ```ts
 * if (!isLaunchPhaseOpen(ctx, now)) deliverImmediately(url);
 * ```
 */
function isLaunchPhaseOpen(ctx: DeepLinkContext, now: Clock): boolean {
  const state = ctx.state;
  if (!state.launchPhaseOpen) {
    return false;
  }
  const at = now();
  state.launchPhaseEndsAt ??= at + LAUNCH_WINDOW_MS;
  if (at < state.launchPhaseEndsAt) {
    return true;
  }
  closeLaunchPhase(state);
  return false;
}

/**
 * Apply the launch handover to one delivery: drop a URL `getCurrent()` already returned
 * (exactly once — the OS replays it onto the freshly registered listener), record a URL
 * the app is seeing for the first time, and end the launch phase when a URL already
 * delivered through this channel arrives again (that repeat is a fresh user action, not
 * a launch replay).
 *
 * @param {DeepLinkContext} ctx - Deep-link domain context.
 * @param {string} url - The delivered URL.
 * @returns {boolean} Whether the URL should reach the app.
 * @example
 * ```ts
 * if (!handOverDelivery(ctx, url)) return;
 * ```
 */
function handOverDelivery(ctx: DeepLinkContext, url: string): boolean {
  const state = ctx.state;
  const path = state.handedOver.get(url);

  if (path === "get-current") {
    state.handedOver.delete(url);
    ctx.log.debug("deepLink:launch-replay-dropped", { url });
    return false;
  }

  if (path === "on-open") {
    closeLaunchPhase(state);
    return true;
  }

  state.handedOver.set(url, "on-open");
  return true;
}

/**
 * Creates the deep-link API surface mounted at app.deepLink.
 *
 * @param {DeepLinkContext} ctx - Deep-link domain context.
 * @param {Clock} [now] - Millisecond clock backing the launch phase (injectable for tests).
 * @returns {DeepLinkApi} The deep-link API surface.
 * @example
 * ```ts
 * const api = createDeepLinkApi(ctx);
 * ```
 */
export function createDeepLinkApi(ctx: DeepLinkContext, now: Clock = Date.now): DeepLinkApi {
  return {
    /**
     * The URL the app was launched with, scheme-filtered; ok(null) when none, filtered,
     * or already delivered to the app through `onOpen` during the launch phase.
     *
     * @returns {Promise<SystemResult<string | null>>} Launch URL or null.
     * @example
     * ```ts
     * const r = await api.getCurrent();
     * ```
     */
    getCurrent: async (): Promise<SystemResult<string | null>> => {
      const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
      if (!resolved.ok) {
        return resolved.failure;
      }

      const result = await resolved.provider.getCurrent();
      if (!result.ok) {
        return result;
      }

      const url = result.value;
      if (url === null) {
        return result;
      }

      if (!isSchemeAllowed(ctx.config.schemes, url)) {
        ctx.log.debug("deepLink:get-current-scheme-filtered", { url });
        // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — null is the documented "no launch URL / filtered" value
        return ok(null, result.provider);
      }

      if (!isLaunchPhaseOpen(ctx, now)) {
        return result;
      }

      // The OS listener saw this launch URL first and the app already has it.
      if (ctx.state.handedOver.get(url) === "on-open") {
        ctx.log.debug("deepLink:get-current-already-delivered", { url });
        // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — already handed over through onOpen
        return ok(null, result.provider);
      }

      // Remember what the caller just read: if the OS replays that same URL onto the
      // freshly registered listener, createDeliver drops it exactly once.
      ctx.state.handedOver.set(url, "get-current");
      return result;
    },

    /**
     * Subscribe to runtime deliveries. Local + synchronous (always succeeds).
     *
     * @param {(payload: { url: string }) => void} cb - Delivery callback.
     * @returns {Unsubscribe} Removes the subscription.
     * @example
     * ```ts
     * const unsub = api.onOpen(({ url }) => route(url));
     * ```
     */
    onOpen: (cb: (payload: { url: string }) => void): Unsubscribe => {
      ctx.state.subscribers.add(cb);
      return (): void => {
        ctx.state.subscribers.delete(cb);
      };
    }
  };
}

/**
 * Creates the delivery function passed to the provider loader: scheme-filters, applies
 * the launch handover, then emits deepLink:open and notifies subscribers. Only the
 * launch phase dedupes — a delivery equal to a URL `getCurrent()` already returned is
 * dropped exactly once. Once the launch phase is over every delivery reaches the app,
 * including a repeat of a URL seen before. A subscriber that throws is caught + logged
 * so one bad island cannot break delivery to the others.
 *
 * @param {DeepLinkContext} ctx - Deep-link domain context.
 * @param {Clock} [now] - Millisecond clock backing the launch phase (injectable for tests).
 * @returns {(url: string) => void} The delivery function wired as the provider's onUrl.
 * @example
 * ```ts
 * loadDeepLinkProvider(ctx, createDeliver(ctx));
 * ```
 */
export function createDeliver(ctx: DeepLinkContext, now: Clock = Date.now): (url: string) => void {
  return (url: string): void => {
    if (!isSchemeAllowed(ctx.config.schemes, url)) {
      ctx.log.debug("deepLink:delivery-scheme-filtered", { url });
      return;
    }

    if (isLaunchPhaseOpen(ctx, now) && !handOverDelivery(ctx, url)) {
      return;
    }

    ctx.emit("deepLink:open", { url });

    for (const subscriber of ctx.state.subscribers) {
      try {
        subscriber({ url });
      } catch (error) {
        ctx.log.error(
          "deepLink:subscriber-failed",
          { url },
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }
  };
}
