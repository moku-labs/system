/**
 * @file clipboard providers — structural provider interface. Both providers satisfy
 * this shape; no `@tauri-apps` types appear here.
 */
import type { SystemResult } from "../../runtime/result";

/** Method names consumed by unsupportedProvider() for absence branches. */
export const CLIPBOARD_METHODS = ["readText", "writeText"] as const;

/**
 * Structural clipboard provider contract (satisfies CapabilityProvider via dispose).
 *
 * @example
 * ```ts
 * const provider: ClipboardProvider = await createWebClipboardProvider(log);
 * ```
 */
export type ClipboardProvider = {
  /** Read clipboard text. */
  readText: () => Promise<SystemResult<string>>;
  /** Write clipboard text. */
  writeText: (text: string) => Promise<SystemResult<void>>;
  /** Teardown (no-op for clipboard; required by CapabilityProvider — F3). */
  dispose: () => Promise<void>;
};
