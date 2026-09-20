// biome-ignore-all assist/source/organizeImports: section order (API → Plugins → Helpers → Types) is house style
/**
 * @file `@moku-labs/system` — isomorphic system API (store, notify, clipboard, tray,
 * deep-link) behind a Tauri/web provider seam. The same island code runs on web and native.
 *
 * The root entry exports the bound {@link createApp} factory (the Layer-3 entry point),
 * {@link createPlugin} for consumer plugins, the `ok`/`err` result helpers, and the types.
 * It exports **no plugin instance**: each capability ships from its own subpath entry
 * (`@moku-labs/system/store`, `/tray`, `/notify`, `/clipboard`, `/deep-link`), so a
 * store-only consumer carries zero bytes of the other capabilities. `src/plugins/index.ts`
 * is the source-tree barrel; nothing here imports it.
 *
 * `createApp(options?)` returns a fully-typed, frozen app synchronously. No capability is
 * registered by default — you compose the ones you need. The `log`, `env` (from
 * `@moku-labs/common`) and `runtime` core plugins are always present as `ctx.log`,
 * `ctx.env`, `ctx.runtime`.
 *
 * | Option | Type | Default | Notes |
 * |---|---|---|---|
 * | `plugins` | `PluginInstance[]` | `[]` | capability plugins, imported from subpaths |
 * | `pluginConfigs` | per-plugin overrides | `{}` | keyed by plugin name, see below |
 * | `config` | `Partial<Config>` | `{}` | empty in v1 — all config is per-plugin |
 * | `onReady` / `onError` | `(ctx) => void` | — | after every `onInit` / on a boot error |
 * | `onStart` / `onStop` | `() => void \| Promise<void>` | — | run by `app.start()` / `app.stop()` |
 *
 * Per-plugin config defaults (`pluginConfigs` keys):
 *
 * | Key | Shape | Default |
 * |---|---|---|
 * | `store` | `{ name: string }` | `"moku-system"` — file-safe, validated at `onInit` |
 * | `tray` | `{ id: string; icon?: string }` | `"moku-system"`; no `icon` = the app's default window icon |
 * | `deepLink` | `{ schemes: string[] }` | `[]` — accept every scheme |
 * | `runtime` | `{ forceKind, forcePlatform }` | `null` / `null` — auto-detect |
 * | `notify`, `clipboard` | — | no config |
 *
 * Providers resolve at `app.start()`, fire-and-forget: a failed or slow resolution folds
 * into the next call's `SystemResult`, never into a startup throw. `app.stop()` awaits the
 * in-flight resolution and disposes the provider.
 *
 * ```ts
 * import { createApp } from "@moku-labs/system";
 * import { storePlugin } from "@moku-labs/system/store";
 *
 * const system = createApp({
 *   plugins: [storePlugin],
 *   pluginConfigs: { store: { name: "my-app" } }
 * });
 *
 * await system.start();
 *
 * const count = await system.store.get<number>("count");
 * if (count.ok) render(count.value ?? 0);
 * else if (count.reason === "unsupported") hideFeature();
 *
 * await system.stop();
 * ```
 */
import { coreConfig, createCore } from "./config";

const framework = createCore(coreConfig, {
  // Zero default plugins — every capability is opt-in (spec/02 §8) so unused
  // capabilities never enter a pure-web consumer's bundle.
  plugins: []
});

// ─── Framework API ───────────────────────────────────────────
/**
 * Create a system app (Layer 3 entry point). Compose the opt-in capability plugins;
 * unused capabilities never enter the bundle. Options and defaults: see the file JSDoc above.
 *
 * @example
 * ```ts
 * const system = createApp({ plugins: [storePlugin], pluginConfigs: { store: { name: "my-app" } } });
 * ```
 */
export const createApp = framework.createApp;

/**
 * Define a consumer (Layer 3) plugin bound to this framework's types. Its context carries
 * `ctx.runtime`, `ctx.log` and `ctx.env`.
 *
 * @example
 * ```ts
 * const myPlugin = createPlugin("my", { api: (ctx) => ({ ping: () => ctx.runtime.kind }) });
 * ```
 */
export const createPlugin = framework.createPlugin;

// ─── Plugins ─────────────────────────────────────────────────
// Intentionally none. Plugin instances are imported from their subpath entries:
//   import { storePlugin }     from "@moku-labs/system/store";
//   import { trayPlugin }      from "@moku-labs/system/tray";
//   import { notifyPlugin }    from "@moku-labs/system/notify";
//   import { clipboardPlugin } from "@moku-labs/system/clipboard";
//   import { deepLinkPlugin }  from "@moku-labs/system/deep-link";
// Re-exporting them here leaked ~2 KB gzipped of unimported capability code into every
// consumer bundle (measured), so the root stays instance-free.

// ─── Helpers ─────────────────────────────────────────────────
/**
 * `SystemResult` construction helpers — `ok(value, provider)` builds a success outcome,
 * `err(provider, reason, message?)` a typed failure. Re-exported from the runtime seam so
 * consumers and consumer plugins can produce contract-conformant results.
 */
export { err, ok } from "./plugins/runtime/result";

// ─── Types ───────────────────────────────────────────────────
// Per-capability type namespaces (type-only — zero bundle cost), accessed as
// Store.StoreApi, Tray.TrayMenuItem, DeepLink.DeepLinkEvents, …
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
export type * as Store from "./plugins/store/types";
export type * as Tray from "./plugins/tray/types";
