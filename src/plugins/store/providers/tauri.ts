/**
 * @file store Tauri provider — `@tauri-apps/plugin-store` glue. The package is reached
 * ONLY via `await import("@tauri-apps/plugin-store")` inside the factory body (stays a
 * live lazy import in dist). Mutations await store.save() (durability contract) — the
 * default autoSave debounce would let a crash lose a write the caller already saw as ok.
 */
import type { LogApi } from "@moku-labs/common";
import type { JsonValue, SystemResult } from "../../runtime/result";
import { err, mapThrownToResult, ok } from "../../runtime/result";
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

  // dispose() closes the underlying Store Resource, so its rid is gone on the Rust
  // side. A call that arrives after that must not reach for a freed handle — an island
  // that outlives app.stop() gets the honest typed failure instead.
  let disposed = false;

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
      if (disposed) {
        return err(PROVIDER, "unavailable", "app stopped");
      }
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
      if (disposed) {
        return err(PROVIDER, "unavailable", "app stopped");
      }
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
      if (disposed) {
        return err(PROVIDER, "unavailable", "app stopped");
      }
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
      if (disposed) {
        return err(PROVIDER, "unavailable", "app stopped");
      }
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
      if (disposed) {
        return err(PROVIDER, "unavailable", "app stopped");
      }
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
     * Teardown — flush pending writes, then release the underlying `Store` Resource so
     * its Rust-side handle is dropped at app.stop(). Never rejects: a failing save must
     * not skip the close, and a failing close must not break the teardown chain; both
     * are reported through ctx.log instead. Idempotent, and every method that arrives
     * afterwards reports `err("tauri", "unavailable", "app stopped")` rather than
     * touching the freed rid.
     *
     * @returns {Promise<void>} Resolves once the store is flushed and closed.
     * @example
     * ```ts
     * await provider.dispose();
     * ```
     */
    dispose: async (): Promise<void> => {
      if (disposed) {
        return;
      }
      disposed = true;
      try {
        await store.save();
      } catch (error) {
        log.error("store:tauri-dispose-save-failed", undefined, toError(error));
      }
      try {
        await store.close();
      } catch (error) {
        log.error("store:tauri-dispose-close-failed", undefined, toError(error));
      }
    }
  };
}
