/**
 * @file Subpath entry `@moku-labs/system/lifecycle` — app pause/resume capability.
 * Import the plugin from here (not the root) so unused capabilities never enter
 * your bundle (D-011b).
 * @example
 * ```ts
 * import { createApp } from "@moku-labs/system";
 * import { lifecyclePlugin } from "@moku-labs/system/lifecycle";
 * const system = createApp({ plugins: [lifecyclePlugin] });
 * ```
 */
/**
 * App lifecycle plugin instance (pause/resume from the native shell and visibilitychange, deduped) — compose it via `createApp({ plugins: [lifecyclePlugin] })`.
 */
export { lifecyclePlugin } from "./plugins/lifecycle";
export type * as Lifecycle from "./plugins/lifecycle/types";
