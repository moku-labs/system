/**
 * @file deep-link plugin — type definitions. Provider interface types are STRUCTURAL and
 * local (never re-export `@tauri-apps/*` types — .d.mts leakage guard).
 */

import type { LogApi } from "@moku-labs/common";
import type { PluginCtx } from "@moku-labs/core";
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
 * Internal deep-link state — resolution slot + dedup guard + island subscribers.
 *
 * @example
 * ```ts
 * { provider: null, lastUrl: null, subscribers: new Set() }
 * ```
 */
export type DeepLinkState = ResolutionState<DeepLinkProvider> & {
  /** Last delivered URL — dedup guard against the upstream getCurrent() replay bug. */
  lastUrl: string | null;
  /** onOpen() callbacks, notified after dedup + scheme filtering. */
  subscribers: Set<(payload: { url: string }) => void>;
};

/**
 * Internal domain context — carries DeepLinkEvents so ctx.emit is strictly typed (spec/15 §6).
 */
export type DeepLinkContext = PluginCtx<DeepLinkConfig, DeepLinkState, DeepLinkEvents> & {
  readonly global: Readonly<Record<string, unknown>>;
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
