/**
 * @file Framework configuration (Layer 1) — the single `createCoreConfig` call that binds
 * this framework's `Config`/`Events` types and registers its core plugins. `src/index.ts`
 * assembles the framework from {@link coreConfig} + {@link createCore}; every plugin under
 * `src/plugins/` imports {@link createPlugin} from here.
 *
 * Core plugins are always registered, and their APIs are injected flat on every plugin
 * context:
 *
 * | Core plugin | Injected as | Config key | Default |
 * |---|---|---|---|
 * | `log` (`@moku-labs/common`) | `ctx.log` | `log` | the package defaults |
 * | `env` (`@moku-labs/common`) | `ctx.env` | `env` | the package defaults |
 * | `runtime` | `ctx.runtime` | `runtime` | `{ forceKind: null, forcePlatform: null }` — auto-detect |
 *
 * The framework-level `config` and `Events` are both empty by decision: capabilities are
 * configured through `pluginConfigs`, and capability events (`deepLink:open`) stay owned by
 * their plugin instead of being promoted to the framework contract.
 *
 * ```ts
 * // src/plugins/store/index.ts
 * import { createPlugin } from "../../config";
 *
 * export const storePlugin = createPlugin("store", { config: defaultConfig, api: createStoreApi });
 * ```
 */
import { envPlugin, logPlugin } from "@moku-labs/common";
import { createCoreConfig } from "@moku-labs/core";
import { runtimePlugin } from "./plugins/runtime";

// ─── Framework API ───────────────────────────────────────────
/**
 * The bound core config for this framework — `Config` + `Events` types and the core plugin
 * registration. Consumed by `src/index.ts` (and by framework-level tests that need to
 * assemble a core with a different plugin set).
 */
export const coreConfig = createCoreConfig<
  Config,
  Events,
  [typeof logPlugin, typeof envPlugin, typeof runtimePlugin]
>("system", {
  config: {},
  // ─── Plugins ───────────────────────────────────────────────
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

// ─── Types ───────────────────────────────────────────────────
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
