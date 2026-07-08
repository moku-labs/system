/**
 * @file Framework configuration — Config + Events types, core plugin registration.
 */
import { envPlugin, logPlugin } from "@moku-labs/common";
import { createCoreConfig } from "@moku-labs/core";
import { runtimePlugin } from "./plugins/runtime";

/**
 * Global configuration shape for the framework. Intentionally empty in v1 —
 * capabilities configure via pluginConfigs.
 */
export type Config = Record<string, never>;

/**
 * Framework-level event contract. Stays empty by stated v1 decision — capability
 * events (deepLink:open) are per-plugin and depends-gated, never promoted here.
 */
export type Events = Record<string, never>;

export const coreConfig = createCoreConfig<
  Config,
  Events,
  [typeof logPlugin, typeof envPlugin, typeof runtimePlugin]
>("system", {
  config: {},
  plugins: [logPlugin, envPlugin, runtimePlugin] // core plugins → ctx.log + ctx.env + ctx.runtime on every ctx
});

/**
 * Define a plugin for this framework. Types infer from the spec object — no explicit
 * generics (R1). Used by every plugin under src/plugins/.
 *
 * @example
 * ```ts
 * export const storePlugin = createPlugin("store", { config: defaultConfig, api: createStoreApi });
 * ```
 */
export const createPlugin = coreConfig.createPlugin;

/**
 * Assemble the framework core (Layer 2) from the shared core config. Consumed by
 * src/index.ts only.
 *
 * @example
 * ```ts
 * const framework = createCore(coreConfig, { plugins: [] });
 * ```
 */
export const createCore = coreConfig.createCore;
