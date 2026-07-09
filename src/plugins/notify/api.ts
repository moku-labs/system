/**
 * @file notify plugin — API factory. Every method awaits the resolution slot
 * and returns SystemResult (see spec 04-notify.md worked example).
 */
import { awaitProvider } from "../runtime/provider";
import type { SystemResult } from "../runtime/result";
import type { NotifyApi, NotifyContext, NotifyOptions } from "./types";

/**
 * Creates the notify API surface mounted at app.notify.
 *
 * @param {NotifyContext} ctx - Notify domain context (config + state + runtime + log).
 * @returns {NotifyApi} The notify API surface.
 * @example
 * ```ts
 * const api = createNotifyApi(ctx);
 * ```
 */
export function createNotifyApi(ctx: NotifyContext): NotifyApi {
  return {
    /**
     * Whether notification permission is currently granted.
     *
     * @returns {Promise<SystemResult<boolean>>} Granted state.
     * @example
     * ```ts
     * const r = await api.isPermissionGranted();
     * ```
     */
    isPermissionGranted: async (): Promise<SystemResult<boolean>> => {
      const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
      if (!resolved.ok) {
        return resolved.failure;
      }
      return resolved.provider.isPermissionGranted();
    },

    /**
     * Prompt the user for notification permission. The ONLY place a prompt may originate.
     *
     * @returns {Promise<SystemResult<boolean>>} Granted after the prompt.
     * @example
     * ```ts
     * const r = await api.requestPermission();
     * ```
     */
    requestPermission: async (): Promise<SystemResult<boolean>> => {
      const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
      if (!resolved.ok) {
        return resolved.failure;
      }
      return resolved.provider.requestPermission();
    },

    /**
     * Show a notification. Never auto-prompts — err("denied") when permission is not granted.
     *
     * @param {NotifyOptions} options - Notification content.
     * @returns {Promise<SystemResult<void>>} ok when displayed.
     * @example
     * ```ts
     * const r = await api.show({ title: "Done" });
     * ```
     */
    show: async (options: NotifyOptions): Promise<SystemResult<void>> => {
      const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
      if (!resolved.ok) {
        return resolved.failure;
      }
      return resolved.provider.show(options);
    }
  };
}
