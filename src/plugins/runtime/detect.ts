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
 * @returns The detected shell kind.
 */
export function detectKind(): RuntimeKind {
  return "__TAURI_INTERNALS__" in globalThis ? "tauri" : "web";
}

/**
 * Detect the OS platform from navigator/UA heuristics; "unknown" when navigator is
 * absent (SSR) or the UA is unrecognized.
 *
 * @example
 * ```ts
 * const platform = detectPlatform(); // "macos" on a Mac
 * ```
 * @returns The detected OS platform.
 */
export function detectPlatform(): RuntimePlatform {
  if (typeof navigator === "undefined") {
    return "unknown";
  }
  const userAgent = navigator.userAgent;
  // Order matters: Android UA contains "Linux"; iOS UA contains "like Mac OS X" —
  // check the more specific device markers before the broader OS markers.
  if (/android/i.test(userAgent)) {
    return "android";
  }
  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return "ios";
  }
  if (/win/i.test(userAgent)) {
    return "windows";
  }
  if (/mac/i.test(userAgent)) {
    return "macos";
  }
  if (/linux/i.test(userAgent)) {
    return "linux";
  }
  return "unknown";
}
