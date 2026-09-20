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

/**
 * Tray capability plugin — desktop status item behind the Tauri/web provider seam; web and
 * Tauri mobile answer `err("unsupported")`. Imported from `@moku-labs/system/tray`.
 *
 * @see README.md
 */
export const trayPlugin = createPlugin(PLUGIN_NAME, {
  config: defaultConfig,
  createState: createTrayState,
  api: createTrayApi,
  /**
   * Validate the tray identity before anything uses it — a programmer error, so it throws
   * at `createApp` instead of folding into a `SystemResult`.
   *
   * @param {object} ctx - Plugin context carrying the resolved tray config.
   * @example
   * ```ts
   * createApp({ plugins: [trayPlugin], pluginConfigs: { tray: { id: " " } } }); // TypeError
   * ```
   */
  onInit: ctx => {
    if (ctx.config.id.trim() === "") {
      throw new TypeError(
        "[system] tray.id must be a non-empty string.\n  Provide an id in pluginConfigs."
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
   * await app.start(); // desktop provider on macos/windows/linux, unsupported elsewhere
   * ```
   */
  onStart: ctx => {
    startResolution(PLUGIN_NAME, ctx.runtime.kind, ctx, loadTrayProvider(ctx));
  },
  /**
   * Await the in-flight resolution, then dispose the provider — that closes the OS tray
   * icon and its current menu.
   *
   * @param {object} ctx - Plugin context carrying the resolution slot.
   * @returns {Promise<void>} Resolves once the tray icon and menu are released.
   * @example
   * ```ts
   * await app.stop(); // status item removed
   * ```
   */
  onStop: ctx => stopResolution(PLUGIN_NAME, ctx)
});
