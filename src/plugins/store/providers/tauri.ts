/**
 * @file store Tauri provider — `@tauri-apps/plugin-store` glue. The package is reached
 * ONLY via `await import("@tauri-apps/plugin-store")` inside the factory body (stays a
 * live lazy import in dist). Mutations await store.save() (durability contract) — the
 * default autoSave debounce would let a crash lose a write the caller already saw as ok.
 */
import type { LogApi } from "@moku-labs/common";
import type { JsonValue, SystemResult } from "../../runtime/result";
import { mapThrownToResult, ok } from "../../runtime/result";
import type { StoreConfig } from "../types";
import type { StoreProvider } from "./types";

const PROVIDER = "tauri";

/**
 * Convert a thrown/rejected value into an Error for ctx.log.error's typed `error` param.
 *
 * @param {unknown} thrown - Whatever was thrown or rejected.
 * @returns {Error} The thrown value as an Error, wrapping non-Error throws.
 * @example
 * ```ts
 * catch (error) { log.error("store:tauri-set-failed", { key }, toError(error)); }
 * ```
 */
function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Create the Tauri store provider. Factory-time throws propagate (folded to
 * "unavailable" by startResolution); method-time throws map to "error" — never "denied".
 *
 * @param {StoreConfig} config - Resolved config (name → `${name}.json`).
 * @param {LogApi} log - ctx.log for error reporting (MC2).
 * @returns {Promise<StoreProvider>} The Tauri-backed store provider.
 * @example
 * ```ts
 * const provider = await createTauriStoreProvider(config, log);
 * ```
 */
export async function createTauriStoreProvider(
  config: StoreConfig,
  log: LogApi
): Promise<StoreProvider> {
  const { load } = await import("@tauri-apps/plugin-store");
  // `defaults` is a required field on the installed plugin-store version's StoreOptions
  // type (2.4.x) — empty object is correct: store contents are seeded by set(), never defaults.
  const store = await load(`${config.name}.json`, { defaults: {}, autoSave: false });

  return {
    /**
     * Read a value from the store file. ok(undefined) when the key is absent.
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
        const value = await store.get<T>(key);
        return ok(value, PROVIDER);
      } catch (error) {
        log.error("store:tauri-get-failed", { key }, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Write a value and await save() so the write is durable before resolving.
     *
     * @param {string} key - The key to write.
     * @param {JsonValue} value - JSON-safe value to persist.
     * @returns {Promise<SystemResult<void>>} ok once the save() completes.
     * @example
     * ```ts
     * const r = await provider.set("count", 1);
     * ```
     */
    set: async (key: string, value: JsonValue): Promise<SystemResult<void>> => {
      try {
        await store.set(key, value);
        await store.save();
        return ok(undefined, PROVIDER);
      } catch (error) {
        log.error("store:tauri-set-failed", { key }, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Remove a key and await save() so the removal is durable before resolving.
     *
     * @param {string} key - The key to remove.
     * @returns {Promise<SystemResult<void>>} ok once the save() completes.
     * @example
     * ```ts
     * const r = await provider.delete("count");
     * ```
     */
    delete: async (key: string): Promise<SystemResult<void>> => {
      try {
        await store.delete(key);
        await store.save();
        return ok(undefined, PROVIDER);
      } catch (error) {
        log.error("store:tauri-delete-failed", { key }, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * List all keys currently in the store file.
     *
     * @returns {Promise<SystemResult<string[]>>} All keys.
     * @example
     * ```ts
     * const r = await provider.keys();
     * ```
     */
    keys: async (): Promise<SystemResult<string[]>> => {
      try {
        const list = await store.keys();
        return ok(list, PROVIDER);
      } catch (error) {
        log.error("store:tauri-keys-failed", undefined, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Remove all keys and await save() so the clear is durable before resolving.
     *
     * @returns {Promise<SystemResult<void>>} ok once the save() completes.
     * @example
     * ```ts
     * const r = await provider.clear();
     * ```
     */
    clear: async (): Promise<SystemResult<void>> => {
      try {
        await store.clear();
        await store.save();
        return ok(undefined, PROVIDER);
      } catch (error) {
        log.error("store:tauri-clear-failed", undefined, toError(error));
        return mapThrownToResult(PROVIDER, error);
      }
    },

    /**
     * Teardown — no-op; there is no OS artifact to release for the store file provider.
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
