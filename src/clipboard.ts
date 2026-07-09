/**
 * @file Subpath entry `@moku-labs/system/clipboard` — text clipboard capability.
 * Import the plugin from here (not the root) so unused capabilities never enter
 * your bundle (D-011b).
 * @example
 * ```ts
 * import { createApp } from "@moku-labs/system";
 * import { clipboardPlugin } from "@moku-labs/system/clipboard";
 * const system = createApp({ plugins: [clipboardPlugin] });
 * ```
 */
export { clipboardPlugin } from "./plugins/clipboard";
export type * as Clipboard from "./plugins/clipboard/types";
