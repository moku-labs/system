/**
 * @file Subpath entry `@moku-labs/system/tray` — desktop system-tray capability.
 * Import the plugin from here (not the root) so unused capabilities never enter
 * your bundle (D-011b).
 * @example
 * ```ts
 * import { createApp } from "@moku-labs/system";
 * import { trayPlugin } from "@moku-labs/system/tray";
 * const system = createApp({ plugins: [trayPlugin] });
 * ```
 */
/**
 * Desktop system-tray plugin instance (typed "unsupported" on web and Tauri mobile) — compose it via `createApp({ plugins: [trayPlugin] })`.
 */
export { trayPlugin } from "./plugins/tray";
export type * as Tray from "./plugins/tray/types";
