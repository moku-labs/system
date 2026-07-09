/**
 * @file Subpath entry `@moku-labs/system/deep-link` — deep-link URL delivery capability.
 * Import the plugin from here (not the root) so unused capabilities never enter
 * your bundle (D-011b).
 * @example
 * ```ts
 * import { createApp } from "@moku-labs/system";
 * import { deepLinkPlugin } from "@moku-labs/system/deep-link";
 * const system = createApp({ plugins: [deepLinkPlugin] });
 * ```
 */
/**
 * Deep-link plugin instance (push-driven; typed deepLink:open event, replay-deduped) — compose it via `createApp({ plugins: [deepLinkPlugin] })`.
 */
export { deepLinkPlugin } from "./plugins/deep-link";
export type * as DeepLink from "./plugins/deep-link/types";
