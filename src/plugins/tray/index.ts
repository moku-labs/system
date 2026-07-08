/**
 * Complex tier — desktop system tray; stress-tests the all-unsupported web branch and
 * the platform-gated Tauri-mobile branch.
 *
 * @see README.md
 */
import { createPlugin } from "../../config";
import { startResolution, stopResolution } from "../runtime/provider";
import { createTrayApi } from "./api";
import { loadTrayProvider } from "./providers/index";
import { createTrayState } from "./state";
import type { TrayConfig } from "./types";

const PLUGIN_NAME = "tray";
const defaultConfig: TrayConfig = { id: "moku-system" };

export const trayPlugin = createPlugin(PLUGIN_NAME, {
  config: defaultConfig,
  createState: createTrayState,
  api: createTrayApi,
  // eslint-disable-next-line jsdoc/require-jsdoc
  onInit: ctx => {
    if (ctx.config.id.trim() === "") {
      throw new TypeError(
        "[system] tray.id must be a non-empty string.\n  Provide an id in pluginConfigs."
      );
    }
  },
  // onStart/onStop manage real resources: the resolution promise + the OS tray icon.
  // eslint-disable-next-line jsdoc/require-jsdoc
  onStart: ctx => {
    startResolution(PLUGIN_NAME, ctx.runtime.kind, ctx, loadTrayProvider(ctx));
  },
  // eslint-disable-next-line jsdoc/require-jsdoc
  onStop: ctx => stopResolution(PLUGIN_NAME, ctx)
});
