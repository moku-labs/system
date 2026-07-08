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

export const deepLinkPlugin = createPlugin(PLUGIN_NAME, {
  config: defaultConfig,
  // eslint-disable-next-line jsdoc/require-jsdoc
  events: register =>
    register.map<DeepLinkEvents>({
      "deepLink:open": "Deep link URL delivered to the running app"
    }),
  createState: createDeepLinkState,
  // eslint-disable-next-line jsdoc/require-jsdoc
  api: ctx => createDeepLinkApi(ctx), // inline lambda REQUIRED for event inference (spec/15 §4)
  // eslint-disable-next-line jsdoc/require-jsdoc
  onInit: ctx => {
    const invalid = ctx.config.schemes.find(scheme => !SCHEME_PATTERN.test(scheme));
    if (invalid !== undefined) {
      throw new TypeError(
        `[system] deepLink.schemes entries must be lowercase URI schemes (e.g. "myapp").\n  Fix "${invalid}" in pluginConfigs.`
      );
    }
  },
  // onStart/onStop manage real resources: the resolution promise + the OS onOpenUrl listener.
  // eslint-disable-next-line jsdoc/require-jsdoc
  onStart: ctx => {
    startResolution(
      PLUGIN_NAME,
      ctx.runtime.kind,
      ctx,
      loadDeepLinkProvider(ctx, createDeliver(ctx))
    );
  },
  // eslint-disable-next-line jsdoc/require-jsdoc
  onStop: ctx => stopResolution(PLUGIN_NAME, ctx)
});
