/**
 * @file keepAwake providers — resolver. Both kinds use the same Screen Wake Lock provider
 * (D-S03): inside Tauri the lock is `navigator.wakeLock` in the webview (P14). There is no
 * `./tauri` module and no Tauri package import, so the kind only tags the results.
 */
import type { KeepAwakeContext } from "../types";
import type { KeepAwakeProvider } from "./types";
import { createWakeLockProvider } from "./wake-lock";

/**
 * Builds the load closure passed to `startResolution`. `"web"` and `"tauri"` both get
 * `createWakeLockProvider`, with the kind passed through. The closure is async, so a throw while
 * probing the API becomes a folded rejection instead of a throw out of the start hook.
 *
 * @param ctx - keepAwake domain context (runtime + log).
 * @returns The load closure for the wake-lock provider.
 * @example
 * ```ts
 * // The provider is created when startResolution calls the closure, not here.
 * startResolution(ctx.runtime.kind, ctx, loadKeepAwakeProvider(ctx));
 * ```
 */
export function loadKeepAwakeProvider(ctx: KeepAwakeContext): () => Promise<KeepAwakeProvider> {
  return async () => createWakeLockProvider(ctx.runtime.kind, ctx.log);
}
