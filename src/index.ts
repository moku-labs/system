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

// ─── Plugin Types (type-only — zero bundle cost) ─────────────
// Plugin INSTANCES live at subpath exports ("@moku-labs/system/store", …) so a
// pure-web consumer's bundle carries only the capabilities it composes (D-011b:
// the root barrel leaked ~2 KB gz of unimported capability code — measured).
export type * as Clipboard from "./plugins/clipboard/types";
export type * as DeepLink from "./plugins/deep-link/types";
export type * as Notify from "./plugins/notify/types";
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
/**
 * `SystemResult` construction helpers — `ok(value, provider)` builds a success outcome,
 * `err(provider, reason, message?)` a typed failure. Re-exported from the runtime seam so
 * consumers and consumer plugins can produce contract-conformant results.
 */
export { err, ok } from "./plugins/runtime/result";
export type * as Store from "./plugins/store/types";
export type * as Tray from "./plugins/tray/types";

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
