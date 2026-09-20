/**
 * @file Synchronous, import-free shell/platform detection. Pure functions; browser
 * globals are touched ONLY inside function bodies (SSR-safe to import under Node).
 */
import type { RuntimeKind, RuntimePlatform } from "./result";

/**
 * Structural shape of the shell marker Tauri 2 sets on the webview global. Declared
 * locally (never `any`) because this project's tsconfig has no DOM/Tauri ambient globals.
 */
type ShellGlobal = { readonly isTauri?: unknown };

/**
 * Structural shape of the `navigator` members this detector reads. Declared locally
 * because the tsconfig targets `lib: ["ESNext"]` — `maxTouchPoints` has no ambient
 * declaration here.
 */
type DetectNavigator = { readonly userAgent: string; readonly maxTouchPoints?: number };

/**
 * Detect the shell kind: "tauri" when either Tauri 2 marker is present on globalThis —
 * the public `isTauri === true` flag or the internal `__TAURI_INTERNALS__` bridge —
 * "web" otherwise.
 *
 * @example
 * ```ts
 * const kind = detectKind(); // "web" in a browser tab
 * ```
 * @returns The detected shell kind.
 */
export function detectKind(): RuntimeKind {
  const shell = globalThis as ShellGlobal;
  if (shell.isTauri === true) {
    return "tauri";
  }
  return "__TAURI_INTERNALS__" in globalThis ? "tauri" : "web";
}

/**
 * Detect the OS platform from navigator/UA heuristics; "unknown" when navigator is
 * absent (SSR) or the UA is unrecognized. An iPad in desktop mode reports a Macintosh
 * UA, so a Macintosh UA that also reports touch points is treated as "ios" — that is
 * what keeps desktop-only capabilities (tray) off an iPad inside the Tauri shell.
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
  const { userAgent, maxTouchPoints } = navigator as DetectNavigator;
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
    // No Mac is a touch device; more than one touch point means iPadOS desktop mode.
    return (maxTouchPoints ?? 0) > 1 ? "ios" : "macos";
  }
  if (/linux/i.test(userAgent)) {
    return "linux";
  }
  return "unknown";
}
