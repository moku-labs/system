/**
 * @file store plugin — API factory. Every method awaits the resolution slot
 * and returns SystemResult (see spec 02-store.md worked example).
 */
import { awaitProvider } from "../runtime/provider";
import type { JsonValue, SystemResult } from "../runtime/result";
import type { StoreApi, StoreContext } from "./types";

/**
 * Creates the store API surface mounted at app.store.
 *
 * @param {StoreContext} ctx - Store domain context (config + state + runtime + log).
 * @returns {StoreApi} The store API surface.
 * @example
 * ```ts
 * const api = createStoreApi(ctx);
 * ```
 */
export function createStoreApi(ctx: StoreContext): StoreApi {
  return {
    /**
     * Read a value. ok(undefined) when the key is absent.
     *
     * @param {string} key - The key to read.
     * @returns {Promise<SystemResult<JsonValue | undefined>>} The stored value or a typed failure.
     * @example
     * ```ts
     * const r = await api.get<number>("count");
     * ```
     */
    get: async <T extends JsonValue = JsonValue>(
      key: string
    ): Promise<SystemResult<T | undefined>> => {
      const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
      if (!resolved.ok) {
        return resolved.failure;
      }
      return resolved.provider.get<T>(key);
    },

    /**
     * Write a value. Durable when the promise resolves ok.
     *
     * @param {string} key - The key to write.
     * @param {JsonValue} value - JSON-safe value (compile-time enforced).
     * @returns {Promise<SystemResult<void>>} ok on durable write.
     * @example
     * ```ts
     * const r = await api.set("count", 1);
     * ```
     */
    set: async <T extends JsonValue>(key: string, value: T): Promise<SystemResult<void>> => {
      const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
      if (!resolved.ok) {
        return resolved.failure;
      }
      return resolved.provider.set(key, value);
    },

    /**
     * Remove a key. void (not "existed") for cross-provider parity (D-003).
     *
     * @param {string} key - The key to remove.
     * @returns {Promise<SystemResult<void>>} ok when removed or absent.
     * @example
     * ```ts
     * const r = await api.delete("count");
     * ```
     */
    delete: async (key: string): Promise<SystemResult<void>> => {
      const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
      if (!resolved.ok) {
        return resolved.failure;
      }
      return resolved.provider.delete(key);
    },

    /**
     * List all keys in the namespace.
     *
     * @returns {Promise<SystemResult<string[]>>} All keys.
     * @example
     * ```ts
     * const r = await api.keys();
     * ```
     */
    keys: async (): Promise<SystemResult<string[]>> => {
      const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
      if (!resolved.ok) {
        return resolved.failure;
      }
      return resolved.provider.keys();
    },

    /**
     * Remove all keys in the namespace.
     *
     * @returns {Promise<SystemResult<void>>} ok when cleared.
     * @example
     * ```ts
     * const r = await api.clear();
     * ```
     */
    clear: async (): Promise<SystemResult<void>> => {
      const resolved = await awaitProvider(ctx.state, ctx.runtime.kind);
      if (!resolved.ok) {
        return resolved.failure;
      }
      return resolved.provider.clear();
    }
  };
}
