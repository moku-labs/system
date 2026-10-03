/**
 * @file Subpath entry `@moku-labs/system/haptics` — haptic feedback capability.
 * Import the plugin from here (not the root) so unused capabilities never enter
 * your bundle (D-011b).
 * @example
 * ```ts
 * import { createApp } from "@moku-labs/system";
 * import { hapticsPlugin } from "@moku-labs/system/haptics";
 * const system = createApp({ plugins: [hapticsPlugin] });
 * ```
 */
/**
 * Haptics plugin instance (Tauri iOS/Android plugin; navigator.vibrate on the web) — compose it via `createApp({ plugins: [hapticsPlugin] })`.
 */
export { hapticsPlugin } from "./plugins/haptics";
export type * as Haptics from "./plugins/haptics/types";
