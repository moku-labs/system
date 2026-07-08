/**
 * Core plugin (Micro tier) — sync shell/platform detection injected as ctx.runtime.
 * This directory also hosts the shared seam modules result.ts + provider.ts (D-008).
 *
 * @see README.md
 */
import { createCorePlugin } from "@moku-labs/core";
import { detectKind, detectPlatform } from "./detect";
import type { RuntimeConfig } from "./types";

// eslint-disable-next-line unicorn/no-null -- null is the approved auto-detect sentinel (RuntimeConfig contract)
const defaultConfig: RuntimeConfig = { forceKind: null, forcePlatform: null };

export const runtimePlugin = createCorePlugin("runtime", {
  config: defaultConfig,
  /**
   * Detect (or force) the shell kind + OS platform, once per app lifetime.
   *
   * @param {object} ctx - Core state context carrying the resolved runtime config.
   * @returns {object} The immutable detection result ({ kind, platform }).
   * @example
   * ```ts
   * // pluginConfigs: { runtime: { forceKind: "web" } } → { kind: "web", platform: detected }
   * ```
   */
  createState: ctx => ({
    kind: ctx.config.forceKind ?? detectKind(),
    platform: ctx.config.forcePlatform ?? detectPlatform()
  }),
  /**
   * Expose the detection result as ctx.runtime on every regular plugin's context.
   *
   * @param {object} ctx - Core API context carrying the detection state.
   * @returns {object} The RuntimeApi surface ({ kind, platform }).
   * @example
   * ```ts
   * if (ctx.runtime.kind === "tauri") loadNativeProvider();
   * ```
   */
  api: ctx => ({
    kind: ctx.state.kind,
    platform: ctx.state.platform
  })
});
