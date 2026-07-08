/**
 * @file Synchronous, import-free shell/platform detection. Pure functions; browser
 * globals are touched ONLY inside function bodies (SSR-safe to import under Node).
 */
import type { RuntimeKind, RuntimePlatform } from "./result";

/**
 * Detect the shell kind: "tauri" when the Tauri 2 marker (__TAURI_INTERNALS__) is
 * present on globalThis, "web" otherwise.
 *
 * @example
 * ```ts
 * const kind = detectKind(); // "web" in a browser tab
 * ```
 */
export function detectKind(): RuntimeKind {
  throw new Error("not implemented");
}

/**
 * Detect the OS platform from navigator/UA heuristics; "unknown" when navigator is
 * absent (SSR) or the UA is unrecognized.
 *
 * @example
 * ```ts
 * const platform = detectPlatform(); // "macos" on a Mac
 * ```
 */
export function detectPlatform(): RuntimePlatform {
  throw new Error("not implemented");
}
