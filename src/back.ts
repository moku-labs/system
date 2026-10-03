/**
 * @file Subpath entry `@moku-labs/system/back` — Android hardware Back capability.
 * Import the plugin from here (not the root) so unused capabilities never enter
 * your bundle (D-011b).
 * @example
 * ```ts
 * import { createApp } from "@moku-labs/system";
 * import { backPlugin } from "@moku-labs/system/back";
 * const system = createApp({ plugins: [backPlugin] });
 * ```
 */
/**
 * Back button plugin instance (Android in Tauri; "unsupported" elsewhere) — compose it via `createApp({ plugins: [backPlugin] })`.
 */
export { backPlugin } from "./plugins/back";
export type * as Back from "./plugins/back/types";
