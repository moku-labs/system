/**
 * @file notify providers — structural provider interface. Both providers satisfy this
 * shape; no `@tauri-apps` types appear here.
 */
import type { SystemResult } from "../../runtime/result";
import type { NotifyOptions } from "../types";

/** Method names consumed by unsupportedProvider() for absence branches. */
export const NOTIFY_METHODS = ["isPermissionGranted", "requestPermission", "show"] as const;

/**
 * Structural notify provider contract (satisfies CapabilityProvider via dispose).
 *
 * Method-shorthand syntax (not arrow-property syntax) is deliberate: TypeScript
 * checks method-shorthand members bivariantly, which is what lets the shared
 * `unsupportedProvider("web", NOTIFY_METHODS)` stand-in (typed
 * `Record<M, (...args: never[]) => Promise<SystemErr>>`) satisfy this interface —
 * arrow-property members are checked contravariantly and would reject it.
 *
 * @example
 * ```ts
 * const provider: NotifyProvider = await createWebNotifyProvider(log);
 * ```
 */
export type NotifyProvider = {
  /** Whether notification permission is currently granted. */
  isPermissionGranted(): Promise<SystemResult<boolean>>;
  /** Prompt the user for notification permission. */
  requestPermission(): Promise<SystemResult<boolean>>;
  /** Show a notification (never auto-prompts). */
  show(options: NotifyOptions): Promise<SystemResult<void>>;
  /** Teardown (no-op for notify; required by CapabilityProvider — F3). */
  dispose(): Promise<void>;
};
