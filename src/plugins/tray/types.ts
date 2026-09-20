/**
 * @file tray plugin — type definitions. Provider interface types are STRUCTURAL and
 * local (never re-export `@tauri-apps/*` types — .d.mts leakage guard).
 */

import type { LogApi } from "@moku-labs/common";
import type { PluginCtx } from "@moku-labs/core";
import type { Config } from "../../config";
import type { ResolutionState } from "../runtime/provider";
import type { SystemResult } from "../runtime/result";
import type { RuntimeApi } from "../runtime/types";
import type { TrayProvider } from "./providers/types";

/**
 * Tray identity config.
 *
 * @example
 * ```ts
 * pluginConfigs: { tray: { id: "my-app-tray" } }
 * ```
 */
export type TrayConfig = {
  /** OS-level tray identity. Validated non-empty at onInit. Default: "moku-system". */
  id: string;
  /**
   * Status-item image: a path the app process can read, or bytes. Omit it to use the
   * app's default window icon (the packager's bundle icon) — the reliable default,
   * since a relative path is resolved against the process working directory, which a
   * bundled app does not control.
   */
  icon?: string;
};

/**
 * Isomorphic tray menu item. action runs in the webview on click (Tauri desktop only).
 *
 * @example
 * ```ts
 * { id: "quit", text: "Quit", action: () => system.tray.destroy() }
 * ```
 */
export type TrayMenuItem = {
  /** Stable item identity. */
  id: string;
  /** Visible label. */
  text: string;
  /** Enabled state; defaults to true. */
  enabled?: boolean;
  /** Click handler (Tauri desktop only). */
  action?: () => void;
};

/**
 * Internal tray state — the resolution slot (the lazy OS icon handle lives inside the
 * Tauri provider closure, not here).
 *
 * @example
 * ```ts
 * { provider: null }
 * ```
 */
export type TrayState = ResolutionState<TrayProvider>;

/**
 * Internal domain context — global/runtime/log extensions (spec/15 §6; not part of the public contract).
 */
export type TrayContext = PluginCtx<TrayConfig, TrayState> & {
  readonly global: Readonly<Config>;
  readonly runtime: RuntimeApi;
  readonly log: LogApi;
};

/**
 * Desktop tray API. Web and Tauri-mobile return err("unsupported") from every method.
 *
 * @example
 * ```ts
 * const r = await app.tray.setMenu(items);
 * if (!r.ok && r.reason === "unsupported") hideTraySettings();
 * ```
 */
export type TrayApi = {
  /**
   * Replace the tray menu. First mutating call creates the OS icon lazily.
   *
   * @param {TrayMenuItem[]} items - Menu items.
   * @returns {Promise<SystemResult<void>>} ok when applied.
   */
  setMenu: (items: TrayMenuItem[]) => Promise<SystemResult<void>>;
  /**
   * Set hover tooltip text.
   *
   * @param {string} text - Tooltip text.
   * @returns {Promise<SystemResult<void>>} ok when applied.
   */
  setTooltip: (text: string) => Promise<SystemResult<void>>;
  /**
   * Set the tray icon by path (path resolution is the native packager's contract).
   *
   * @param {string} iconPath - Icon path.
   * @returns {Promise<SystemResult<void>>} ok when applied.
   */
  setIcon: (iconPath: string) => Promise<SystemResult<void>>;
  /**
   * Remove the tray icon; next mutating call recreates it. ok even if never created.
   *
   * @returns {Promise<SystemResult<void>>} ok when removed or absent.
   */
  destroy: () => Promise<SystemResult<void>>;
};
