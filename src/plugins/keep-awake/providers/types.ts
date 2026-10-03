/**
 * @file keepAwake providers — structural provider contract. One implementation
 * (`wake-lock.ts`) serves both kinds. No DOM type and no Tauri package type appears here.
 */
import type { SystemResult } from "../../runtime/result";

/** Method names `unsupportedProvider()` stubs when `navigator.wakeLock` is missing. */
export const KEEP_AWAKE_METHODS = ["set"] as const;

/**
 * Structural keep-awake provider contract. `dispose` makes it a `CapabilityProvider`.
 *
 * The members use method-shorthand syntax on purpose. TypeScript checks method-shorthand members
 * bivariantly, so the shared `unsupportedProvider(kind, KEEP_AWAKE_METHODS)` stand-in, typed
 * `Record<"set", (...args: never[]) => Promise<SystemErr>>`, satisfies this type.
 *
 * @example
 * ```ts
 * // The stand-in for a runtime without navigator.wakeLock: every call answers "unsupported".
 * const provider: KeepAwakeProvider = unsupportedProvider("web", KEEP_AWAKE_METHODS);
 * await provider.set(true); // { ok: false, provider: "web", reason: "unsupported" }
 * ```
 */
export type KeepAwakeProvider = {
  /** Holds the screen wake lock (`true`) or releases it (`false`). */
  set(on: boolean): Promise<SystemResult<void>>;
  /** Teardown: removes the visibility listener, releases a held lock and drops the wish. */
  dispose(): Promise<void>;
};
