/**
 * @file tray Tauri provider skeleton — `@tauri-apps/api` tray/menu glue. Packages are
 * reached ONLY via `await import("@tauri-apps/api/tray")` + `await import("@tauri-apps/api/menu")`
 * inside factory/method bodies (stay live lazy imports in dist). The OS icon is created
 * lazily on the first mutating call; dispose destroys it.
 */
import type { LogApi } from "@moku-labs/common";
import type { TrayConfig } from "../types";
import type { TrayProvider } from "./types";

/**
 * Create the Tauri desktop tray provider. Factory-time throws propagate (folded to
 * "unavailable" by startResolution); method-time throws map to "error" — never "denied".
 *
 * @param {TrayConfig} _config - Resolved config (id → OS tray identity).
 * @param {LogApi} _log - ctx.log for error reporting (MC2).
 * @example
 * ```ts
 * const provider = await createTauriTrayProvider(config, log);
 * ```
 */
export async function createTauriTrayProvider(
  _config: TrayConfig,
  _log: LogApi
): Promise<TrayProvider> {
  throw new Error("not implemented");
}
