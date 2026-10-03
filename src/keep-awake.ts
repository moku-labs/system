/**
 * @file Subpath entry `@moku-labs/system/keep-awake` — keep-the-screen-on capability.
 * Import the plugin from here (not the root) so unused capabilities never enter
 * your bundle (D-011b).
 * @example
 * ```ts
 * import { createApp } from "@moku-labs/system";
 * import { keepAwakePlugin } from "@moku-labs/system/keep-awake";
 * const system = createApp({ plugins: [keepAwakePlugin] });
 * ```
 */
/**
 * Keep-awake plugin instance (Screen Wake Lock in the browser and the webview, re-acquired when visible) — compose it via `createApp({ plugins: [keepAwakePlugin] })`.
 */
export { keepAwakePlugin } from "./plugins/keep-awake";
export type * as KeepAwake from "./plugins/keep-awake/types";
