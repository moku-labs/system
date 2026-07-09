/**
 * @file Subpath entry `@moku-labs/system/notify` — OS/browser notification capability.
 * Import the plugin from here (not the root) so unused capabilities never enter
 * your bundle (D-011b).
 * @example
 * ```ts
 * import { createApp } from "@moku-labs/system";
 * import { notifyPlugin } from "@moku-labs/system/notify";
 * const system = createApp({ plugins: [notifyPlugin] });
 * ```
 */
/**
 * Notification plugin instance (explicit permission flow; show() never auto-prompts) — compose it via `createApp({ plugins: [notifyPlugin] })`.
 */
export { notifyPlugin } from "./plugins/notify";
export type * as Notify from "./plugins/notify/types";
