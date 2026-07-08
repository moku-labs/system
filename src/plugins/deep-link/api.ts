/**
 * @file deep-link plugin — API factory skeleton, plus the delivery pipeline factory
 * (filter → dedup → emit + notify) consumed by onStart's provider wiring.
 */
import type { DeepLinkApi, DeepLinkContext } from "./types";

/**
 * Creates the deep-link API surface mounted at app.deepLink.
 *
 * @param {DeepLinkContext} _ctx - Deep-link domain context.
 * @example
 * ```ts
 * const api = createDeepLinkApi(ctx);
 * ```
 */
export function createDeepLinkApi(_ctx: DeepLinkContext): DeepLinkApi {
  throw new Error("not implemented");
}

/**
 * Creates the delivery function passed to the provider loader: scheme-filters,
 * dedups against state.lastUrl, then emits deepLink:open and notifies subscribers.
 *
 * @param {DeepLinkContext} _ctx - Deep-link domain context.
 * @example
 * ```ts
 * loadDeepLinkProvider(ctx, createDeliver(ctx));
 * ```
 */
export function createDeliver(_ctx: DeepLinkContext): (url: string) => void {
  throw new Error("not implemented");
}
