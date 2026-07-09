/**
 * @file store web provider — IndexedDB via idb-keyval (dynamic import). Runs a one-time
 * write-probe at creation (Safari private mode → deterministic "unavailable" instead of
 * a random runtime throw). No browser globals at module scope (SSR-safe).
 */
import type { LogApi } from "@moku-labs/common";
import type { JsonValue, SystemResult } from "../../runtime/result";
import { mapThrownToResult, ok } from "../../runtime/result";
import type { StoreConfig } from "../types";
import type { StoreProvider } from "./types";

const PROVIDER = "web";
const PROBE_KEY = "__moku_probe__";

/**
 * Convert a thrown/rejected value into an Error for ctx.log.error's typed `error` param.
 *
 * @param {unknown} thrown - Whatever was thrown or rejected.
 * @returns {Error} The thrown value as an Error, wrapping non-Error throws.
 * @example
 * ```ts
 * catch (error) { log.error("store:web-set-failed", { key }, toError(error)); }
 * ```
 */
function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Create the IndexedDB store provider. Probe failure throws (folded to "unavailable"
 * by startResolution) — a real Safari-private-mode quota error surfaces deterministically
 * instead of on some later, random caller's method call.
 *
 * @param {StoreConfig} config - Resolved config (name → database name).
 * @param {LogApi} log - ctx.log for error reporting (MC2).
 * @returns {Promise<StoreProvider>} The IndexedDB-backed store provider.
 * @example
 * ```ts
 * const provider = await createWebStoreProvider(config, log);
 * ```
 */
export async function createWebStoreProvider(
  config: StoreConfig,
  log: LogApi
): Promise<StoreProvider> {
  const idb = await import("idb-keyval");
  const store = idb.createStore(config.name, "kv");

  await idb.set(PROBE_KEY, 1, store);
  await idb.del(PROBE_KEY, store);

  return {
    /**
     * Read a value from IndexedDB. ok(undefined) when the key is absent.
     *
     * @param {string} key - The key to read.
     * @returns {Promise<SystemResult<T | undefined>>} The stored value or a typed failure.
     * @example
     * ```ts
     * const r = await provider.get<number>("count");
     * ```
     */
    get: async <T extends JsonValue>(key: string): Promise<SystemResult<T | undefined>> => {
      try {
        const value = await idb.get<T>(key, store);
        return ok(value, PROVIDER);
      } catch (error) {
        log.error("store:web-get-failed", { key }, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Write a value; resolves once the IndexedDB transaction commits.
     *
     * @param {string} key - The key to write.
     * @param {JsonValue} value - JSON-safe value to persist.
     * @returns {Promise<SystemResult<void>>} ok once the transaction commits.
     * @example
     * ```ts
     * const r = await provider.set("count", 1);
     * ```
     */
    set: async (key: string, value: JsonValue): Promise<SystemResult<void>> => {
      try {
        await idb.set(key, value, store);
        return ok(undefined, PROVIDER);
      } catch (error) {
        log.error("store:web-set-failed", { key }, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Remove a key; resolves once the IndexedDB transaction commits.
     *
     * @param {string} key - The key to remove.
     * @returns {Promise<SystemResult<void>>} ok once the transaction commits.
     * @example
     * ```ts
     * const r = await provider.delete("count");
     * ```
     */
    delete: async (key: string): Promise<SystemResult<void>> => {
      try {
        await idb.del(key, store);
        return ok(undefined, PROVIDER);
      } catch (error) {
        log.error("store:web-delete-failed", { key }, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * List all keys currently in the object store.
     *
     * @returns {Promise<SystemResult<string[]>>} All keys.
     * @example
     * ```ts
     * const r = await provider.keys();
     * ```
     */
    keys: async (): Promise<SystemResult<string[]>> => {
      try {
        const list = await idb.keys<string>(store);
        return ok(list, PROVIDER);
      } catch (error) {
        log.error("store:web-keys-failed", undefined, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Remove all keys; resolves once the IndexedDB transaction commits.
     *
     * @returns {Promise<SystemResult<void>>} ok once the transaction commits.
     * @example
     * ```ts
     * const r = await provider.clear();
     * ```
     */
    clear: async (): Promise<SystemResult<void>> => {
      try {
        await idb.clear(store);
        return ok(undefined, PROVIDER);
      } catch (error) {
        log.error("store:web-clear-failed", undefined, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Teardown — no-op; there is no OS artifact to release for the IndexedDB provider.
     *
     * @returns {Promise<void>} Resolves immediately.
     * @example
     * ```ts
     * await provider.dispose();
     * ```
     */
    dispose: (): Promise<void> => Promise.resolve()
  };
}
