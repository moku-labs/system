/**
 * @file store web provider skeleton — IndexedDB via idb-keyval (dynamic import).
 * Runs a one-time write-probe at creation (Safari private mode → deterministic
 * "unavailable"). No browser globals at module scope (SSR-safe).
 */
import type { LogApi } from "@moku-labs/common";
import type { StoreConfig } from "../types";
import type { StoreProvider } from "./types";

/**
 * Create the IndexedDB store provider. Probe failure throws (folded to "unavailable").
 *
 * @param {StoreConfig} _config - Resolved config (name → database name).
 * @param {LogApi} _log - ctx.log for error reporting (MC2).
 * @example
 * ```ts
 * const provider = await createWebStoreProvider(config, log);
 * ```
 */
export async function createWebStoreProvider(
  _config: StoreConfig,
  _log: LogApi
): Promise<StoreProvider> {
  throw new Error("not implemented");
}
