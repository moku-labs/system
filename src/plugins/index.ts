// biome-ignore-all assist/source/organizeImports: two-section barrel layout (instances → type namespaces) is house style
/**
 * @file Plugin barrel — every plugin instance this framework ships, plus the per-plugin
 * type namespaces. It is the map of `src/plugins/`, not a package entry.
 *
 * Decision (zero-leak subpaths): the package root entry `src/index.ts` imports nothing
 * from here and exports no plugin instance. Instances ship from one subpath entry each
 * (`@moku-labs/system/store`, `/tray`, `/notify`, `/clipboard`, `/deep-link`), so a
 * store-only consumer bundles zero bytes of the other capabilities — a root barrel
 * re-exporting instances measured ~2 KB gzipped of unimported capability code in every
 * consumer bundle. This file exists for readers of the source tree and for internal
 * composition; adding it to `src/index.ts` would undo that.
 */

// ─── Plugin Instances ────────────────────────────────────────
export { clipboardPlugin } from "./clipboard";
export { deepLinkPlugin } from "./deep-link";
export { notifyPlugin } from "./notify";
export { runtimePlugin } from "./runtime";
export { storePlugin } from "./store";
export { trayPlugin } from "./tray";

// ─── Plugin Types (type-only — zero bundle cost) ─────────────
// Consumers access types as: Store.StoreApi, Tray.TrayMenuItem, DeepLink.DeepLinkEvents, …
export type * as Clipboard from "./clipboard/types";
export type * as DeepLink from "./deep-link/types";
export type * as Notify from "./notify/types";
export type * as Runtime from "./runtime/types";
export type * as Store from "./store/types";
export type * as Tray from "./tray/types";
