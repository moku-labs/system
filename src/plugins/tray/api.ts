/**
 * @file tray plugin — API factory. Every method awaits the resolution slot
 * and returns SystemResult (see spec 03-tray.md worked example).
 */
import { awaitProvider } from "../runtime/provider";
import type { SystemResult } from "../runtime/result";
import type { TrayApi, TrayContext, TrayMenuItem } from "./types";

/**
 * Creates the tray API surface mounted at app.tray.
 *
 * @param {TrayContext} ctx - Tray domain context (config + state + runtime + log).
 * @returns {TrayApi} The tray API surface.
 * @example
 * ```ts
 * const api = createTrayApi(ctx);
 * ```
 */
export function createTrayApi(ctx: TrayContext): TrayApi {
  return {
    /**
     * Replace the tray menu. First mutating call creates the OS tray icon lazily.
     *
     * @param {TrayMenuItem[]} items - Menu items.
     * @returns {Promise<SystemResult<void>>} ok when applied.
     * @example
     * ```ts
     * const r = await api.setMenu([{ id: "quit", text: "Quit" }]);
     * ```
     */
    setMenu: async (items: TrayMenuItem[]): Promise<SystemResult<void>> => {
      const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
      if (!resolved.ok) {
        return resolved.failure;
      }
      return resolved.provider.setMenu(items);
    },

    /**
     * Set hover tooltip text.
     *
     * @param {string} text - Tooltip text.
     * @returns {Promise<SystemResult<void>>} ok when applied.
     * @example
     * ```ts
     * const r = await api.setTooltip("hover text");
     * ```
     */
    setTooltip: async (text: string): Promise<SystemResult<void>> => {
      const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
      if (!resolved.ok) {
        return resolved.failure;
      }
      return resolved.provider.setTooltip(text);
    },

    /**
     * Set the tray icon by path (path resolution is the native packager's contract).
     *
     * @param {string} iconPath - Icon path.
     * @returns {Promise<SystemResult<void>>} ok when applied.
     * @example
     * ```ts
     * const r = await api.setIcon("/path/icon.png");
     * ```
     */
    setIcon: async (iconPath: string): Promise<SystemResult<void>> => {
      const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
      if (!resolved.ok) {
        return resolved.failure;
      }
      return resolved.provider.setIcon(iconPath);
    },

    /**
     * Remove the tray icon; next mutating call recreates it. ok even if never created.
     *
     * @returns {Promise<SystemResult<void>>} ok when removed or absent.
     * @example
     * ```ts
     * const r = await api.destroy();
     * ```
     */
    destroy: async (): Promise<SystemResult<void>> => {
      const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
      if (!resolved.ok) {
        return resolved.failure;
      }
      return resolved.provider.destroy();
    }
  };
}
