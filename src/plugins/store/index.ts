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
const defaultConfig: StoreConfig = { name: "moku-system" };

export const storePlugin = createPlugin(PLUGIN_NAME, {
  config: defaultConfig,
  createState: createStoreState,
  api: createStoreApi,
  // eslint-disable-next-line jsdoc/require-jsdoc
  onInit: ctx => {
    if (ctx.config.name.trim() === "") {
      throw new TypeError(
        "[system] store.name must be a non-empty string.\n  Provide a name in pluginConfigs."
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
