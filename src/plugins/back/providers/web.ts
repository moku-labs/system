/**
 * @file back web provider — the all-unsupported branch (kept as a file for anatomy
 * symmetry with the other capability plugins). A browser has no hardware Back event:
 * a history trap breaks the browser's own Back, and `CloseWatcher` is Chromium only
 * (P16). Returns unsupportedProvider("web", BACK_METHODS) — the SAME shared factory the
 * non-Android Tauri branch in providers/index.ts uses.
 */
import { unsupportedProvider } from "../../runtime/result";
import type { BackProvider } from "./types";
import { BACK_METHODS } from "./types";

/**
 * Create the web back provider: every method resolves to err("web", "unsupported").
 * A permanent absence, not a probe result.
 *
 * @returns {BackProvider} The all-unsupported web stand-in provider.
 * @example
 * ```ts
 * await createWebBackProvider().exit(); // { ok: false, provider: "web", reason: "unsupported" }
 * ```
 */
export function createWebBackProvider(): BackProvider {
  return unsupportedProvider("web", BACK_METHODS);
}
