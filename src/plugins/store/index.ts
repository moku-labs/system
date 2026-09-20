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

export const storePlugin = createPlugin(PLUGIN_NAME, {
  config: defaultConfig,
  createState: createStoreState,
  api: createStoreApi,
  // eslint-disable-next-line jsdoc/require-jsdoc
  onInit: ctx => {
    if (!NAME_PATTERN.test(ctx.config.name)) {
      throw new TypeError(
        `[system] store.name must be a file-safe namespace — received "${ctx.config.name}".\n  Use letters, digits, ".", "-" or "_" and start with a letter or digit, e.g. pluginConfigs: { store: { name: "my-app" } }.`
      );
    }
  },
  // onStart/onStop manage a real resource: the in-flight provider resolution promise.
  // eslint-disable-next-line jsdoc/require-jsdoc
  onStart: ctx => {
    startResolution(PLUGIN_NAME, ctx.runtime.kind, ctx, loadStoreProvider(ctx));
  },
  // eslint-disable-next-line jsdoc/require-jsdoc
  onStop: ctx => stopResolution(PLUGIN_NAME, ctx)
});
