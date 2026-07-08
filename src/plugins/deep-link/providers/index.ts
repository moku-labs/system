/**
 * @file deep-link providers — resolver. Selection branches once on ctx.runtime.kind
 * inside the returned load closure (D-012); the push channel (onUrl) is wired at
 * factory time, not a method.
 */
import type { DeepLinkContext } from "../types";
import type { DeepLinkProvider } from "./types";

/**
 * Build the load closure passed to startResolution. kind "tauri" → plugin-deep-link
 * provider (registers the OS onOpenUrl listener onto onUrl); otherwise → web provider
 * (no push deliveries in v1).
 *
 * @param {DeepLinkContext} _ctx - Deep-link domain context (config + runtime + log).
 * @param {(url: string) => void} _onUrl - Delivery channel (filter → dedup → emit + notify).
 * @example
 * ```ts
 * startResolution("deepLink", ctx.runtime.kind, ctx, loadDeepLinkProvider(ctx, createDeliver(ctx)));
 * ```
 */
export function loadDeepLinkProvider(
  _ctx: DeepLinkContext,
  _onUrl: (url: string) => void
): () => Promise<DeepLinkProvider> {
  throw new Error("not implemented");
}
