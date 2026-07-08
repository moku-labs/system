/**
 * Complex tier — clipboard text access (core trio; feature-probed, NotAllowedError →
 * typed "denied").
 *
 * @see README.md
 */
import { createPlugin } from "../../config";
import { startResolution, stopResolution } from "../runtime/provider";
import { createClipboardApi } from "./api";
import { loadClipboardProvider } from "./providers/index";
import { createClipboardState } from "./state";

const PLUGIN_NAME = "clipboard";

export const clipboardPlugin = createPlugin(PLUGIN_NAME, {
  createState: createClipboardState,
  api: createClipboardApi,
  // onStart/onStop manage a real resource: the in-flight provider resolution promise.
  // eslint-disable-next-line jsdoc/require-jsdoc
  onStart: ctx => {
    startResolution(PLUGIN_NAME, ctx.runtime.kind, ctx, loadClipboardProvider(ctx));
  },
  // eslint-disable-next-line jsdoc/require-jsdoc
  onStop: ctx => stopResolution(PLUGIN_NAME, ctx)
});
