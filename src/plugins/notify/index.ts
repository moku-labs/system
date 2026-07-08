/**
 * Complex tier — OS/browser notifications (core trio; explicit permission flow, show()
 * never auto-prompts).
 *
 * @see README.md
 */
import { createPlugin } from "../../config";
import { startResolution, stopResolution } from "../runtime/provider";
import { createNotifyApi } from "./api";
import { loadNotifyProvider } from "./providers/index";
import { createNotifyState } from "./state";

const PLUGIN_NAME = "notify";

export const notifyPlugin = createPlugin(PLUGIN_NAME, {
  createState: createNotifyState,
  api: createNotifyApi,
  // onStart/onStop manage a real resource: the in-flight provider resolution promise.
  // eslint-disable-next-line jsdoc/require-jsdoc
  onStart: ctx => {
    startResolution(PLUGIN_NAME, ctx.runtime.kind, ctx, loadNotifyProvider(ctx));
  },
  // eslint-disable-next-line jsdoc/require-jsdoc
  onStop: ctx => stopResolution(PLUGIN_NAME, ctx)
});
