/**
 * @file store plugin — type definitions. Provider interface types are STRUCTURAL and
 * local (never re-export `@tauri-apps/*` types — .d.mts leakage guard).
 */

import type { LogApi } from "@moku-labs/common";
import type { PluginCtx } from "@moku-labs/core";
import type { ResolutionState } from "../runtime/provider";
import type { JsonValue, SystemResult } from "../runtime/result";
import type { RuntimeApi } from "../runtime/types";
import type { StoreProvider } from "./providers/types";

/**
 * Store namespace config — maps to the Tauri store filename and IndexedDB database name.
 *
 * @example
 * ```ts
 * pluginConfigs: { store: { name: "my-app" } }
 * ```
 */
export type StoreConfig = {
  /** Namespace for persisted data. Validated non-empty at onInit. Default: "moku-system". */
  name: string;
};

/**
 * Internal store state — the resolution slot.
 *
 * @example
 * ```ts
 * // after onStart: { provider: Promise<ResolvedProvider<StoreProvider>> }
 * { provider: null }
 * ```
 */
export type StoreState = ResolutionState<StoreProvider>;

/**
 * Internal domain context — global/runtime/log extensions (spec/15 §6; not part of the public contract).
 */
export type StoreContext = PluginCtx<StoreConfig, StoreState> & {
  readonly global: Readonly<Record<string, unknown>>;
  readonly runtime: RuntimeApi;
  readonly log: LogApi;
};

/**
 * Key-value persistence API. Every method returns SystemResult — environmental
 * failures are typed data, never throws.
 *
 * @example
 * ```ts
 * const r = await app.store.get<number>("count");
 * if (r.ok) use(r.value ?? 0);
 * ```
 */
export type StoreApi = {
  /**
   * Read a value. ok(undefined) when the key is absent.
   *
   * @param {string} key - The key to read.
   * @returns {Promise<SystemResult<JsonValue | undefined>>} The stored value or a typed failure.
   */
  get: <T extends JsonValue = JsonValue>(key: string) => Promise<SystemResult<T | undefined>>;
  /**
   * Write a value. Durable when the promise resolves ok (Tauri: awaited save()).
   *
   * @param {string} key - The key to write.
   * @param {JsonValue} value - JSON-safe value (compile-time enforced).
   * @returns {Promise<SystemResult<void>>} ok on durable write.
   */
  set: <T extends JsonValue>(key: string, value: T) => Promise<SystemResult<void>>;
  /**
   * Remove a key. void (not "existed") for cross-provider parity (D-003).
   *
   * @param {string} key - The key to remove.
   * @returns {Promise<SystemResult<void>>} ok when removed or absent.
   */
  delete: (key: string) => Promise<SystemResult<void>>;
  /**
   * List all keys in the namespace.
   *
   * @returns {Promise<SystemResult<string[]>>} All keys.
   */
  keys: () => Promise<SystemResult<string[]>>;
  /**
   * Remove all keys in the namespace.
   *
   * @returns {Promise<SystemResult<void>>} ok when cleared.
   */
  clear: () => Promise<SystemResult<void>>;
};
