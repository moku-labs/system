/**
 * @file store providers — structural provider interface. Both providers satisfy this
 * shape; no `@tauri-apps` types appear here.
 */
import type { JsonValue, SystemResult } from "../../runtime/result";

/**
 * Structural store provider contract (satisfies CapabilityProvider via dispose).
 *
 * @example
 * ```ts
 * const provider: StoreProvider = createWebStoreProvider(config, log);
 * ```
 */
export type StoreProvider = {
  /** Read a value; undefined when absent. */
  get: <T extends JsonValue>(key: string) => Promise<SystemResult<T | undefined>>;
  /** Write a value durably. */
  set: (key: string, value: JsonValue) => Promise<SystemResult<void>>;
  /** Remove a key. */
  delete: (key: string) => Promise<SystemResult<void>>;
  /** List keys. */
  keys: () => Promise<SystemResult<string[]>>;
  /** Remove all keys. */
  clear: () => Promise<SystemResult<void>>;
  /** Teardown (no-op for store; required by CapabilityProvider — F3). */
  dispose: () => Promise<void>;
};
