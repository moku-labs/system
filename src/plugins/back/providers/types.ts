/**
 * @file back providers — structural provider interface. Every provider satisfies this
 * shape; no `@tauri-apps` types appear here.
 */
import type { SystemResult } from "../../runtime/result";

/** Method names consumed by unsupportedProvider() for the web and non-Android Tauri branches. */
export const BACK_METHODS = ["listen", "unlisten", "exit"] as const;

/**
 * Structural back provider contract (satisfies CapabilityProvider via dispose).
 *
 * Method-shorthand syntax (not arrow-property syntax) is deliberate: TypeScript
 * checks method-shorthand members bivariantly, which is what lets the shared
 * `unsupportedProvider("web" | "tauri", BACK_METHODS)` stand-in (typed
 * `Record<M, (...args: never[]) => Promise<SystemErr>>`) satisfy this interface —
 * arrow-property members are checked contravariantly and would reject it.
 *
 * @example
 * ```ts
 * // The web branch: no hardware Back, so every method answers "unsupported".
 * const provider: BackProvider = unsupportedProvider("web", BACK_METHODS);
 * ```
 */
export type BackProvider = {
  /**
   * Registers the native Back listener. A press calls `dispatch` first; when it returns
   * false the provider runs the platform default. Called only while handlers exist.
   */
  listen(dispatch: () => boolean): Promise<SystemResult<void>>;
  /** Unregisters the native listener, which restores the system Back. Ok when none is held. */
  unlisten(): Promise<SystemResult<void>>;
  /** Closes the app. */
  exit(): Promise<SystemResult<void>>;
  /** Unregisters the listener once; afterwards `listen` and `exit` answer "unavailable". */
  dispose(): Promise<void>;
};
