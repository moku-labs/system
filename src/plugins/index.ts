/**
 * Plugin barrel — re-exports all framework plugin instances and types.
 * Helpers are NOT exported here — see src/index.ts. runtimePlugin is a core plugin
 * registered in src/config.ts, not a composable instance, so it is absent here.
 */

// ─── Plugin Instances ────────────────────────────────────────
export { clipboardPlugin } from "./clipboard";
// ─── Plugin Types (namespace re-exports) ─────────────────────
export * as Clipboard from "./clipboard/types";
export { deepLinkPlugin } from "./deep-link";
export * as DeepLink from "./deep-link/types";
export { notifyPlugin } from "./notify";
export * as Notify from "./notify/types";
export { storePlugin } from "./store";
export * as Store from "./store/types";
export { trayPlugin } from "./tray";
export * as Tray from "./tray/types";
