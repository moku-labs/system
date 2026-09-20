/**
 * Complex tier — deep-link delivery; the only push-driven capability (typed
 * deepLink:open event + onOpen subscription; dedup against upstream replay bug).
 *
 * @see README.md
 */
import { createPlugin } from "../../config";
import { startResolution, stopResolution } from "../runtime/provider";
import { createDeepLinkApi, createDeliver } from "./api";
import { loadDeepLinkProvider } from "./providers/index";
import { createDeepLinkState } from "./state";
import type { DeepLinkConfig, DeepLinkEvents } from "./types";

const PLUGIN_NAME = "deepLink";
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*$/;
const defaultConfig: DeepLinkConfig = { schemes: [] };

/**
 * Deep-link capability plugin — launch URL plus push deliveries behind the Tauri/web
 * provider seam. Imported from `@moku-labs/system/deep-link`; emits `deepLink:open`.
 *
 * @see README.md
 */
export const deepLinkPlugin = createPlugin(PLUGIN_NAME, {
  config: defaultConfig,
  /**
   * Declare this plugin's typed event contract.
   *
   * @param {object} register - The kernel's event register helper.
   * @returns {object} The typed `deepLink:open` event map.
   * @example
   * ```ts
   * hooks: (ctx) => ({ "deepLink:open": ({ url }) => route(url) })
   * ```
   */
  events: register =>
    register.map<DeepLinkEvents>({
      "deepLink:open": "Deep link URL delivered to the running app"
    }),
  createState: createDeepLinkState,
  /**
   * Build the public API. The inline lambda is required for event inference (spec/15 §4) —
   * passing `createDeepLinkApi` directly would drop the typed `ctx.emit`.
   *
   * @param {object} ctx - Plugin context with the typed emit for `deepLink:open`.
   * @returns {object} The deep-link API (`getCurrent`, `onOpen`).
   * @example
   * ```ts
   * const unsubscribe = app.deepLink.onOpen(({ url }) => route(url));
   * ```
   */
  api: ctx => createDeepLinkApi(ctx),
  /**
   * Validate the configured scheme allowlist before anything uses it — a programmer error,
   * so it throws at `createApp` instead of folding into a `SystemResult`.
   *
   * @param {object} ctx - Plugin context carrying the resolved deep-link config.
   * @example
   * ```ts
   * createApp({ plugins: [deepLinkPlugin], pluginConfigs: { deepLink: { schemes: ["My App"] } } }); // TypeError
   * ```
   */
  onInit: ctx => {
    const invalid = ctx.config.schemes.find(scheme => !SCHEME_PATTERN.test(scheme));
    if (invalid !== undefined) {
      throw new TypeError(
        `[system] deepLink.schemes entries must be lowercase URI schemes (e.g. "myapp").\n  Fix "${invalid}" in pluginConfigs.`
      );
    }
  },
  /**
   * Start provider resolution and register the OS delivery listener — fire-and-forget, so
   * a slow or failing `@tauri-apps/*` load never blocks `app.start()`.
   *
   * @param {object} ctx - Plugin context; carries the detected runtime and the state slot.
   * @example
   * ```ts
   * await app.start(); // onOpenUrl listener registered on the Tauri side
   * ```
   */
  onStart: ctx => {
    startResolution(
      PLUGIN_NAME,
      ctx.runtime.kind,
      ctx,
      loadDeepLinkProvider(ctx, createDeliver(ctx))
    );
  },
  /**
   * Await the in-flight resolution, then dispose the provider — that unregisters the OS
   * delivery listener, so no URL arrives after `app.stop()`.
   *
   * @param {object} ctx - Plugin context carrying the resolution slot.
   * @returns {Promise<void>} Resolves once the listener is gone.
   * @example
   * ```ts
   * await app.stop(); // deliveries stop before stop() resolves
   * ```
   */
  onStop: ctx => stopResolution(PLUGIN_NAME, ctx)
});
