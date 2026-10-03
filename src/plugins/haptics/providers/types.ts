/**
 * @file haptics providers — structural provider contract. The Tauri provider, the web
 * provider and the unsupported stand-in all satisfy it; no `@tauri-apps` type appears here.
 */
import type { SystemResult } from "../../runtime/result";
import type { ImpactKind, NotifyKind } from "../types";

/** Method names `unsupportedProvider()` stubs for the absence branches. */
export const HAPTICS_METHODS = ["impact", "notify", "selection"] as const;

/** One haptics provider method; the `method` field of a failure log entry. */
export type HapticsMethod = (typeof HAPTICS_METHODS)[number];

/**
 * Structural haptics provider contract (satisfies CapabilityProvider through `dispose`).
 *
 * Method-shorthand syntax is deliberate: TypeScript checks method-shorthand members
 * bivariantly, which lets the shared `unsupportedProvider(kind, HAPTICS_METHODS)` stand-in
 * (typed `Record<M, (...args: never[]) => Promise<SystemErr>>`) satisfy this type.
 * Arrow-property members are checked contravariantly and would reject it.
 *
 * @example
 * ```ts
 * // A silent provider for a test: every haptic succeeds and nothing vibrates.
 * const silent: HapticsProvider = {
 *   impact: async () => ok(undefined, "web"),
 *   notify: async () => ok(undefined, "web"),
 *   selection: async () => ok(undefined, "web"),
 *   dispose: async () => {}
 * };
 * ```
 */
export type HapticsProvider = {
  /** Play an impact tap of the given strength. */
  impact(kind: ImpactKind): Promise<SystemResult<void>>;
  /** Play the pattern for an outcome. */
  notify(kind: NotifyKind): Promise<SystemResult<void>>;
  /** Play the selection-changed tick. */
  selection(): Promise<SystemResult<void>>;
  /** Teardown. A no-op for both providers: a haptic holds no OS resource. */
  dispose(): Promise<void>;
};
