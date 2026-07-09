/**
 * @file tray web provider — the all-unsupported branch (kept as a file for anatomy
 * symmetry with the other capability plugins). Returns unsupportedProvider("web",
 * TRAY_METHODS) — the SAME shared factory used by the Tauri-mobile absence branch in
 * providers/index.ts, so the "sloppy hand-written all-unsupported provider" risk
 * cannot silently relocate here.
 */
import { unsupportedProvider } from "../../runtime/result";
import type { TrayProvider } from "./types";
import { TRAY_METHODS } from "./types";

/**
 * Create the web tray provider: every method resolves to err("web", "unsupported").
 * No browser tray API exists, so this is a permanent absence, not a probe result.
 *
 * @returns {TrayProvider} The all-unsupported web stand-in provider.
 * @example
 * ```ts
 * const provider = createWebTrayProvider();
 * ```
 */
export function createWebTrayProvider(): TrayProvider {
  return unsupportedProvider("web", TRAY_METHODS);
}
