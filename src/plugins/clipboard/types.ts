/**
 * @file clipboard plugin — type definitions. Provider interface types are STRUCTURAL and
 * local (never re-export `@tauri-apps/*` types — .d.mts leakage guard).
 */

import type { LogApi } from "@moku-labs/common";
import type { PluginCtx } from "@moku-labs/core";
import type { ResolutionState } from "../runtime/provider";
import type { SystemResult } from "../runtime/result";
import type { RuntimeApi } from "../runtime/types";
import type { ClipboardProvider } from "./providers/types";

/**
 * Internal clipboard state — the resolution slot.
 *
 * @example
 * ```ts
 * { provider: null }
 * ```
 */
export type ClipboardState = ResolutionState<ClipboardProvider>;

/**
 * Internal domain context — global/runtime/log extensions (spec/15 §6; not part of the public contract).
 */
export type ClipboardContext = PluginCtx<Record<string, never>, ClipboardState> & {
  readonly global: Readonly<Record<string, unknown>>;
  readonly runtime: RuntimeApi;
  readonly log: LogApi;
};

/**
 * Clipboard text API. NotAllowedError maps to err("denied"); support is feature-probed
 * (no permissions.query).
 *
 * @example
 * ```ts
 * const r = await app.clipboard.readText();
 * if (r.ok) paste(r.value);
 * ```
 */
export type ClipboardApi = {
  /**
   * Read clipboard text.
   *
   * @returns {Promise<SystemResult<string>>} Clipboard contents.
   */
  readText: () => Promise<SystemResult<string>>;
  /**
   * Write clipboard text.
   *
   * @param {string} text - Text to write.
   * @returns {Promise<SystemResult<void>>} ok when written.
   */
  writeText: (text: string) => Promise<SystemResult<void>>;
};
