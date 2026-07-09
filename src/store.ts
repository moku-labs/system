/**
 * @file Subpath entry `@moku-labs/system/store` — key-value persistence capability.
 * Import the plugin from here (not the root) so unused capabilities never enter
 * your bundle (D-011b).
 * @example
 * ```ts
 * import { createApp } from "@moku-labs/system";
 * import { storePlugin } from "@moku-labs/system/store";
 * const system = createApp({ plugins: [storePlugin] });
 * ```
 */
export { storePlugin } from "./plugins/store";
export type * as Store from "./plugins/store/types";
