/**
 * Complex tier — key-value persistence over a Tauri-or-web provider (template capability).
 *
 * @see README.md
 */
import { createPlugin } from "../../config";
import { startResolution, stopResolution } from "../runtime/provider";
import { createStoreApi } from "./api";
import { loadStoreProvider } from "./providers/index";
import { createStoreState } from "./state";
import type { StoreConfig } from "./types";

const PLUGIN_NAME = "store";
// The name becomes a filename segment under app_data_dir on the Tauri side, so it is
// restricted to file-safe characters: no separators, no leading dot, no "..".
const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
const defaultConfig: StoreConfig = { name: "moku-system" };

/**
 * Store capability plugin — JSON-safe key-value persistence behind the Tauri/web provider
 * seam. Imported from `@moku-labs/system/store` and composed via `createApp({ plugins })`.
 *
 * @see README.md
 */
export const storePlugin = createPlugin(PLUGIN_NAME, {
  config: defaultConfig,
  createState: createStoreState,
  api: createStoreApi,
  /**
   * Validate the configured namespace before anything uses it — a programmer error, so it
   * throws at `createApp` instead of folding into a `SystemResult`.
   *
   * @param {object} ctx - Plugin context carrying the resolved store config.
   * @example
   * ```ts
   * createApp({ plugins: [storePlugin], pluginConfigs: { store: { name: "../escape" } } }); // TypeError
   * ```
   */
  onInit: ctx => {
    if (!NAME_PATTERN.test(ctx.config.name)) {
      throw new TypeError(
        `[system] store.name must be a file-safe namespace — received "${ctx.config.name}".\n  Use letters, digits, ".", "-" or "_" and start with a letter or digit, e.g. pluginConfigs: { store: { name: "my-app" } }.`
      );
    }
  },
  /**
   * Start provider resolution — fire-and-forget, so a slow or failing `@tauri-apps/*`
   * load never blocks `app.start()`; the failure folds into the next call's result.
   *
   * @param {object} ctx - Plugin context; carries the detected runtime and the state slot.
   * @example
   * ```ts
   * await app.start(); // store provider resolution begins here
   * ```
   */
  onStart: ctx => {
    startResolution(PLUGIN_NAME, ctx.runtime.kind, ctx, loadStoreProvider(ctx));
  },
  /**
   * Await the in-flight resolution, then dispose the provider — on Tauri that saves and
   * closes the underlying store resource.
   *
   * @param {object} ctx - Plugin context carrying the resolution slot.
   * @returns {Promise<void>} Resolves once the provider is disposed.
   * @example
   * ```ts
   * await app.stop(); // pending writes saved, store closed
   * ```
   */
  onStop: ctx => stopResolution(PLUGIN_NAME, ctx)
});
