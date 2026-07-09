/**
 * @file deep-link providers — resolver. Selection branches once on ctx.runtime.kind
 * inside the returned load closure (D-012); the push channel (onUrl) is wired at
 * factory time, not a method.
 */
import type { DeepLinkContext } from "../types";
import { createTauriDeepLinkProvider } from "./tauri";
import type { DeepLinkProvider } from "./types";
import { createWebDeepLinkProvider } from "./web";

/**
 * Build the load closure passed to startResolution. kind "tauri" → plugin-deep-link
 * provider (registers the OS onOpenUrl listener onto onUrl); otherwise → web provider
 * (no push deliveries in v1).
 *
 * @param {DeepLinkContext} ctx - Deep-link domain context (config + runtime + log).
 * @param {(url: string) => void} onUrl - Delivery channel (filter → dedup → emit + notify).
 * @returns {() => Promise<DeepLinkProvider>} The load closure for the selected provider.
 * @example
 * ```ts
 * startResolution("deepLink", ctx.runtime.kind, ctx, loadDeepLinkProvider(ctx, createDeliver(ctx)));
 * ```
 */
export function loadDeepLinkProvider(
  ctx: DeepLinkContext,
  onUrl: (url: string) => void
): () => Promise<DeepLinkProvider> {
  if (ctx.runtime.kind === "tauri") {
    return () => createTauriDeepLinkProvider(ctx.config, ctx.log, onUrl);
  }
  return () => createWebDeepLinkProvider(ctx.config, ctx.log);
}
