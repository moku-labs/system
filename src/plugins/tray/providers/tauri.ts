/**
 * @file tray Tauri provider — `@tauri-apps/api` tray/menu glue. The packages are
 * reached ONLY via `await import("@tauri-apps/api/tray")` + `await import("@tauri-apps/api/menu")`
 * inside the factory body (stay live lazy imports in dist). Resolution itself is
 * side-effect-free: the factory never creates the OS tray icon. A private
 * `ensureIcon()` creates it lazily on the first mutating call and caches the handle
 * in this closure; `destroy()`/`dispose()` destroy it idempotently, and the next
 * mutating call after a destroy recreates it lazily again.
 */
import type { LogApi } from "@moku-labs/common";
import type { SystemResult } from "../../runtime/result";
import { mapThrownToResult, ok } from "../../runtime/result";
import type { TrayConfig, TrayMenuItem } from "../types";
import type { TrayProvider } from "./types";

const PROVIDER = "tauri";

/**
 * Convert a thrown/rejected value into an Error for ctx.log.error's typed `error` param.
 *
 * @param {unknown} thrown - Whatever was thrown or rejected.
 * @returns {Error} The thrown value as an Error, wrapping non-Error throws.
 * @example
 * ```ts
 * catch (error) { log.error("tray:tauri-set-menu-failed", undefined, toError(error)); }
 * ```
 */
function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Local, structural shape for a single native menu item build — matches
 * `@tauri-apps/api/menu`'s `MenuItemOptions` without importing its type (structural,
 * local — no `@tauri-apps` re-export, per the .d.mts leakage guard).
 */
type NativeMenuItemOptions = {
  id: string;
  text: string;
  enabled?: boolean;
  action?: (id: string) => void;
};

/**
 * Wrap a zero-arg TrayMenuItem action as a native `(id: string) => void` click handler.
 *
 * @param {() => void} action - The original isomorphic action callback.
 * @returns {(id: string) => void} A native-shaped click handler that ignores the id.
 * @example
 * ```ts
 * const handler = buildActionHandler(() => app.quit());
 * ```
 */
function buildActionHandler(action: () => void): (id: string) => void {
  return (): void => action();
}

/**
 * Map an isomorphic TrayMenuItem to the native menu item shape, wiring `action`
 * into a click handler that invokes the original zero-arg callback. Optional keys
 * are included only when present (exactOptionalPropertyTypes-safe).
 *
 * @param {TrayMenuItem} item - The isomorphic tray menu item.
 * @returns {NativeMenuItemOptions} The native-shaped menu item options.
 * @example
 * ```ts
 * const native = toNativeMenuItem({ id: "quit", text: "Quit", action: () => app.quit() });
 * ```
 */
function toNativeMenuItem(item: TrayMenuItem): NativeMenuItemOptions {
  return {
    id: item.id,
    text: item.text,
    ...(item.enabled === undefined ? {} : { enabled: item.enabled }),
    ...(item.action === undefined ? {} : { action: buildActionHandler(item.action) })
  };
}

/**
 * Create the Tauri desktop tray provider. Factory-time throws propagate (folded to
 * "unavailable" by startResolution); method-time throws map to "error" — never "denied"
 * (ACL "not allowed" throws are ambiguous, D-004).
 *
 * @param {TrayConfig} config - Resolved config (id → OS tray identity).
 * @param {LogApi} log - ctx.log for error reporting (MC2).
 * @returns {Promise<TrayProvider>} The Tauri-backed tray provider.
 * @example
 * ```ts
 * const provider = await createTauriTrayProvider(config, log);
 * ```
 */
export async function createTauriTrayProvider(
  config: TrayConfig,
  log: LogApi
): Promise<TrayProvider> {
  const { TrayIcon } = await import("@tauri-apps/api/tray");
  const { Menu } = await import("@tauri-apps/api/menu");

  let icon: Awaited<ReturnType<typeof TrayIcon.new>> | undefined;

  /**
   * Lazily create (or return the cached) OS tray icon handle.
   *
   * @returns {Promise<Awaited<ReturnType<typeof TrayIcon.new>>>} The tray icon handle.
   * @example
   * ```ts
   * const trayIcon = await ensureIcon();
   * ```
   */
  async function ensureIcon(): Promise<Awaited<ReturnType<typeof TrayIcon.new>>> {
    if (icon === undefined) {
      icon = await TrayIcon.new({ id: config.id });
    }
    return icon;
  }

  /**
   * Destroy the cached icon if present; idempotent when never created or already
   * destroyed. Clears the cache so the next mutating call recreates it lazily.
   *
   * @returns {Promise<void>} Resolves once teardown completes.
   * @example
   * ```ts
   * await destroyIcon();
   * ```
   */
  async function destroyIcon(): Promise<void> {
    if (icon !== undefined) {
      const current = icon;
      icon = undefined;
      await current.close();
    }
  }

  return {
    /**
     * Replace the tray menu. Creates the OS icon lazily on first call.
     *
     * @param {TrayMenuItem[]} items - Menu items.
     * @returns {Promise<SystemResult<void>>} ok when applied.
     * @example
     * ```ts
     * const r = await provider.setMenu([{ id: "quit", text: "Quit" }]);
     * ```
     */
    setMenu: async (items: TrayMenuItem[]): Promise<SystemResult<void>> => {
      try {
        const trayIcon = await ensureIcon();
        const menu = await Menu.new({ items: items.map(item => toNativeMenuItem(item)) });
        await trayIcon.setMenu(menu);
        return ok(undefined, PROVIDER);
      } catch (error) {
        log.error("tray:tauri-set-menu-failed", undefined, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Set hover tooltip text. Creates the OS icon lazily on first call.
     *
     * @param {string} text - Tooltip text.
     * @returns {Promise<SystemResult<void>>} ok when applied.
     * @example
     * ```ts
     * const r = await provider.setTooltip("hover text");
     * ```
     */
    setTooltip: async (text: string): Promise<SystemResult<void>> => {
      try {
        const trayIcon = await ensureIcon();
        await trayIcon.setTooltip(text);
        return ok(undefined, PROVIDER);
      } catch (error) {
        log.error("tray:tauri-set-tooltip-failed", { text }, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Set the tray icon by path. Creates the OS icon lazily on first call.
     *
     * @param {string} iconPath - Icon path.
     * @returns {Promise<SystemResult<void>>} ok when applied.
     * @example
     * ```ts
     * const r = await provider.setIcon("/path/icon.png");
     * ```
     */
    setIcon: async (iconPath: string): Promise<SystemResult<void>> => {
      try {
        const trayIcon = await ensureIcon();
        await trayIcon.setIcon(iconPath);
        return ok(undefined, PROVIDER);
      } catch (error) {
        log.error("tray:tauri-set-icon-failed", { iconPath }, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Remove the tray icon; next mutating call recreates it. ok even if never created.
     *
     * @returns {Promise<SystemResult<void>>} ok when removed or absent.
     * @example
     * ```ts
     * const r = await provider.destroy();
     * ```
     */
    destroy: async (): Promise<SystemResult<void>> => {
      try {
        await destroyIcon();
        return ok(undefined, PROVIDER);
      } catch (error) {
        log.error("tray:tauri-destroy-failed", undefined, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Teardown — destroys the cached OS icon if present (idempotent with destroy()).
     *
     * @returns {Promise<void>} Resolves once teardown completes.
     * @example
     * ```ts
     * await provider.dispose();
     * ```
     */
    dispose: (): Promise<void> => destroyIcon()
  };
}
