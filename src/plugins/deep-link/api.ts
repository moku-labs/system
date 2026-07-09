/**
 * @file deep-link plugin — API factory, plus the delivery pipeline factory (filter →
 * dedup → emit + notify) consumed by onStart's provider wiring.
 */
import { awaitProvider } from "../runtime/provider";
import type { SystemResult } from "../runtime/result";
import { ok } from "../runtime/result";
import type { DeepLinkApi, DeepLinkContext, Unsubscribe } from "./types";

const SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

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
 * Creates the deep-link API surface mounted at app.deepLink.
 *
 * @param {DeepLinkContext} ctx - Deep-link domain context.
 * @returns {DeepLinkApi} The deep-link API surface.
 * @example
 * ```ts
 * const api = createDeepLinkApi(ctx);
 * ```
 */
export function createDeepLinkApi(ctx: DeepLinkContext): DeepLinkApi {
  return {
    /**
     * The URL the app was launched with, scheme-filtered; ok(null) when none/filtered.
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
      if (result.value !== null && !isSchemeAllowed(ctx.config.schemes, result.value)) {
        ctx.log.debug("deepLink:get-current-scheme-filtered", { url: result.value });
        // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — null is the documented "no launch URL / filtered" value
        return ok(null, result.provider);
      }
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
 * Creates the delivery function passed to the provider loader: scheme-filters,
 * dedups against state.lastUrl, then emits deepLink:open and notifies subscribers.
 * A subscriber that throws is caught + logged so one bad island cannot break
 * delivery to the others.
 *
 * @param {DeepLinkContext} ctx - Deep-link domain context.
 * @returns {(url: string) => void} The delivery function wired as the provider's onUrl.
 * @example
 * ```ts
 * loadDeepLinkProvider(ctx, createDeliver(ctx));
 * ```
 */
export function createDeliver(ctx: DeepLinkContext): (url: string) => void {
  return (url: string): void => {
    if (!isSchemeAllowed(ctx.config.schemes, url)) {
      ctx.log.debug("deepLink:delivery-scheme-filtered", { url });
      return;
    }
    if (url === ctx.state.lastUrl) {
      ctx.log.debug("deepLink:delivery-deduped", { url });
      return;
    }
    ctx.state.lastUrl = url;

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
