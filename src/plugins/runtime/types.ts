/**
 * @file runtime plugin — type definitions.
 */
import type { RuntimeKind, RuntimePlatform } from "./result";

/**
 * Runtime detection overrides — both null by default (auto-detect).
 *
 * @example
 * ```ts
 * pluginConfigs: { runtime: { forceKind: "web" } }
 * ```
 */
export type RuntimeConfig = {
  /** Force the detected shell kind. Default: null (auto-detect). */
  forceKind: RuntimeKind | null;
  /** Force the detected OS platform. Default: null (auto-detect). */
  forcePlatform: RuntimePlatform | null;
};

/**
 * Internal runtime state — detection result, computed once in createState.
 *
 * @example
 * ```ts
 * { kind: "web", platform: "macos" }
 * ```
 */
export type RuntimeState = {
  /** Detected (or forced) shell kind. Never changes for the app's lifetime. */
  kind: RuntimeKind;
  /** Detected (or forced) OS platform. */
  platform: RuntimePlatform;
};

/**
 * The API injected on every regular plugin's context as ctx.runtime.
 *
 * @example
 * ```ts
 * if (ctx.runtime.kind === "tauri" && ctx.runtime.platform === "ios") { ... }
 * ```
 */
export type RuntimeApi = {
  /** The active shell kind. */
  readonly kind: RuntimeKind;
  /** The OS platform within the kind. */
  readonly platform: RuntimePlatform;
};
