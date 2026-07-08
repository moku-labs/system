/**
 * @file `@moku-labs/system` — isomorphic system API (store, notify, clipboard, tray,
 * deep-link) behind a Tauri/web provider seam. Same island code runs on web and native.
 */
import { coreConfig, createCore } from "./config";

const framework = createCore(coreConfig, {
  // Zero default plugins — every capability is opt-in (spec/02 §8) so unused
  // capabilities never enter a pure-web consumer's bundle.
  plugins: []
});

// ─── Plugins + Types ──────────────────────────────────────────
export * from "./plugins";
export type {
  JsonPrimitive,
  JsonValue,
  RuntimeKind,
  RuntimePlatform,
  SystemErr,
  SystemErrorReason,
  SystemOk,
  SystemResult
} from "./plugins/runtime/result";
// ─── Public contract (SystemResult seam) ─────────────────────
export { err, ok } from "./plugins/runtime/result";

// ─── Framework API ───────────────────────────────────────────
/**
 * Create a system app (Layer 3 entry point). Compose the opt-in capability plugins;
 * unused capabilities never enter the bundle.
 *
 * @example
 * ```ts
 * const system = createApp({ plugins: [storePlugin], pluginConfigs: { store: { name: "my-app" } } });
 * ```
 */
export const createApp = framework.createApp;

/**
 * Define a consumer (Layer 3) plugin bound to this framework's types.
 *
 * @example
 * ```ts
 * const myPlugin = createPlugin("my", { api: (ctx) => ({ ping: () => ctx.runtime.kind }) });
 * ```
 */
export const createPlugin = framework.createPlugin;
