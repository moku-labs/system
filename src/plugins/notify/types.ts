/**
 * @file notify plugin — type definitions. Provider interface types are STRUCTURAL and
 * local (never re-export `@tauri-apps/*` types — .d.mts leakage guard).
 */

import type { LogApi } from "@moku-labs/common";
import type { PluginCtx } from "@moku-labs/core";
import type { Config } from "../../config";
import type { ResolutionState } from "../runtime/provider";
import type { SystemResult } from "../runtime/result";
import type { RuntimeApi } from "../runtime/types";
import type { NotifyProvider } from "./providers/types";

/**
 * Notification content.
 *
 * @example
 * ```ts
 * await app.notify.show({ title: "Done", body: "Export finished." });
 * ```
 */
export type NotifyOptions = {
  /** Notification title. */
  title: string;
  /** Optional body text. */
  body?: string;
};

/**
 * Internal notify state — the resolution slot.
 *
 * @example
 * ```ts
 * { provider: null }
 * ```
 */
export type NotifyState = ResolutionState<NotifyProvider>;

/**
 * Internal domain context — global/runtime/log extensions (spec/15 §6; not part of the public contract).
 */
export type NotifyContext = PluginCtx<Record<string, never>, NotifyState> & {
  readonly global: Readonly<Config>;
  readonly runtime: RuntimeApi;
  readonly log: LogApi;
};

/**
 * Notification API — explicit permission flow; show() never auto-prompts.
 *
 * @example
 * ```ts
 * const granted = await app.notify.isPermissionGranted();
 * if (granted.ok && !granted.value) await app.notify.requestPermission();
 * ```
 */
export type NotifyApi = {
  /**
   * Whether notification permission is currently granted.
   *
   * @returns {Promise<SystemResult<boolean>>} Granted state.
   */
  isPermissionGranted: () => Promise<SystemResult<boolean>>;
  /**
   * Prompt the user for notification permission.
   *
   * @returns {Promise<SystemResult<boolean>>} Granted after the prompt.
   */
  requestPermission: () => Promise<SystemResult<boolean>>;
  /**
   * Show a notification. Never auto-prompts — err("denied") when permission is not granted.
   *
   * @param {NotifyOptions} options - Notification content.
   * @returns {Promise<SystemResult<void>>} ok when displayed.
   */
  show: (options: NotifyOptions) => Promise<SystemResult<void>>;
};
