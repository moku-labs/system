/**
 * @file store Tauri provider skeleton — `@tauri-apps/plugin-store` glue. The package is
 * reached ONLY via `await import("@tauri-apps/plugin-store")` inside the factory body
 * (stays a live lazy import in dist). Mutations await store.save() (durability contract).
 */
import type { LogApi } from "@moku-labs/common";
import type { StoreConfig } from "../types";
import type { StoreProvider } from "./types";

/**
 * Create the Tauri store provider. Factory-time throws propagate (folded to
 * "unavailable" by startResolution); method-time throws map to "error" — never "denied".
 *
 * @param {StoreConfig} _config - Resolved config (name → `${name}.json`).
 * @param {LogApi} _log - ctx.log for error reporting (MC2).
 * @example
 * ```ts
 * const provider = await createTauriStoreProvider(config, log);
 * ```
 */
export async function createTauriStoreProvider(
  _config: StoreConfig,
  _log: LogApi
): Promise<StoreProvider> {
  throw new Error("not implemented");
}
