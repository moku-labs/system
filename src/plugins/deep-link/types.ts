/**
 * @file deep-link plugin — type definitions. Provider interface types are STRUCTURAL and
 * local (never re-export `@tauri-apps/*` types — .d.mts leakage guard).
 */

import type { LogApi } from "@moku-labs/common";
import type { PluginCtx } from "@moku-labs/core";
import type { Config } from "../../config";
import type { ResolutionState } from "../runtime/provider";
import type { SystemResult } from "../runtime/result";
import type { RuntimeApi } from "../runtime/types";
import type { DeepLinkProvider } from "./providers/types";

/**
 * Deep-link scheme allowlist.
 *
 * @example
 * ```ts
 * pluginConfigs: { deepLink: { schemes: ["myapp"] } }
 * ```
 */
export type DeepLinkConfig = {
  /** Allowed URI schemes; empty = accept all. Validated at onInit (lowercase scheme pattern). */
  schemes: string[];
};

/**
 * Typed per-plugin events (visible to this plugin + future depends-declared plugins).
 *
 * @example
 * ```ts
 * hooks: (ctx) => ({ "deepLink:open": ({ url }) => route(url) })
 * ```
 */
export type DeepLinkEvents = {
  /** A deep-link URL was delivered to the running app (post-dedup, post-filter). */
  "deepLink:open": { url: string };
};

/** Unsubscribe function returned by onOpen. */
export type Unsubscribe = () => void;

/**
 * Millisecond clock backing the launch phase. Injectable so tests can cross the window
 * boundary without timers.
 *
 * @example
 * ```ts
 * const deliver = createDeliver(ctx, () => fakeNow);
 * ```
 */
export type Clock = () => number;

/**
 * Which path first handed a launch-phase URL to the app — the record `createDeliver`
 * and `getCurrent()` share so each launch URL reaches the app exactly once.
 *
 * @example
 * ```ts
 * state.handedOver.get("myapp://open"); // "get-current" | "on-open" | undefined
 * ```
 */
export type HandoverPath = "get-current" | "on-open";

/**
 * Internal deep-link state — resolution slot + launch-phase handover record + subscribers.
 *
 * @example
 * ```ts
 * { provider: null, handedOver: new Map(), launchPhaseOpen: true, launchPhaseEndsAt: null, subscribers: new Set() }
 * ```
 */
export type DeepLinkState = ResolutionState<DeepLinkProvider> & {
  /** Launch-phase URLs already handed to the app, keyed by the path that handed them over. */
  handedOver: Map<string, HandoverPath>;
  /** Whether the launch phase is still running (it ends early, or on the clock). */
  launchPhaseOpen: boolean;
  /** Clock deadline of the launch phase; null until the first launch-phase URL is seen. */
  launchPhaseEndsAt: number | null;
  /** onOpen() callbacks, notified after the handover guard + scheme filtering. */
  subscribers: Set<(payload: { url: string }) => void>;
};

/**
 * Internal domain context — carries DeepLinkEvents so ctx.emit is strictly typed (spec/15 §6).
 */
export type DeepLinkContext = PluginCtx<DeepLinkConfig, DeepLinkState, DeepLinkEvents> & {
  readonly global: Readonly<Config>;
  readonly runtime: RuntimeApi;
  readonly log: LogApi;
};

/**
 * Deep-link API — launch URL + runtime delivery subscription.
 *
 * @example
 * ```ts
 * const unsub = app.deepLink.onOpen(({ url }) => route(url));
 * ```
 */
export type DeepLinkApi = {
  /**
   * The URL the app was launched with, scheme-filtered; ok(null) when none.
   *
   * @returns {Promise<SystemResult<string | null>>} Launch URL or null.
   */
  getCurrent: () => Promise<SystemResult<string | null>>;
  /**
   * Subscribe to runtime deliveries. Local + synchronous (always succeeds); on web no
   * push deliveries occur in v1.
   *
   * @param {(payload: { url: string }) => void} cb - Delivery callback.
   * @returns {Unsubscribe} Removes the subscription.
   */
  onOpen: (cb: (payload: { url: string }) => void) => Unsubscribe;
};
