/**
 * @file deep-link providers — structural provider interface. Both providers satisfy
 * this shape; no `@tauri-apps` types appear here.
 */
import type { SystemResult } from "../../runtime/result";

/**
 * Structural deep-link provider contract (satisfies CapabilityProvider via dispose).
 * Runtime deliveries arrive through the onUrl channel wired at factory time, not a method.
 *
 * @example
 * ```ts
 * const provider: DeepLinkProvider = await createWebDeepLinkProvider(config, log);
 * ```
 */
export type DeepLinkProvider = {
  /** The URL the app was launched with; null when none. */
  getCurrent: () => Promise<SystemResult<string | null>>;
  /** Unregisters the OS listener (Tauri); no-op on web. */
  dispose: () => Promise<void>;
};
