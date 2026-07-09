/**
 * @file deep-link web provider — launch URL only (no push deliveries in v1: PWA
 * `protocol_handlers`/`launchQueue` require installed-PWA manifest config outside this
 * framework's runtime scope). No browser globals at module scope (SSR-safe) — `location`
 * is read inside the factory body, not at import time.
 */
import type { LogApi } from "@moku-labs/common";
import type { SystemResult } from "../../runtime/result";
import { ok } from "../../runtime/result";
import type { DeepLinkConfig } from "../types";
import type { DeepLinkProvider } from "./types";

const PROVIDER = "web";

/**
 * Structural shape of the subset of `Location` this provider reads. Declared locally
 * (rather than relying on the DOM lib) because the project's tsconfig targets
 * Bun/Node with `lib: ["ESNext"]` only — no ambient `Location`/`location` global.
 */
type WebLocation = { readonly href: string };

/**
 * Create the web deep-link provider: getCurrent reflects the launch URL captured at
 * construction time; dispose is a no-op (no OS listener exists on web).
 *
 * @param {DeepLinkConfig} _config - Resolved config (scheme allowlist; filtering happens
 *   in the plugin layer, not here).
 * @param {LogApi} _log - ctx.log for error reporting (MC2); unused on the web provider,
 *   since getCurrent here cannot throw.
 * @returns {Promise<DeepLinkProvider>} The web-backed deep-link provider.
 * @example
 * ```ts
 * const provider = await createWebDeepLinkProvider(config, log);
 * ```
 */
export async function createWebDeepLinkProvider(
  _config: DeepLinkConfig,
  _log: LogApi
): Promise<DeepLinkProvider> {
  // `location` is a real DOM/browser global with no ambient declaration under this
  // project's DOM-lib-free tsconfig — narrowed immediately via a local structural
  // type (R9's "real boundary, narrowed before use" carve-out), never `any`.
  const globalScope = globalThis as { location?: WebLocation };
  // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — null when no launch URL / SSR
  const launchUrl = globalScope.location === undefined ? null : globalScope.location.href;

  return {
    /**
     * The URL the app was launched with (the captured page location); null when none
     * (e.g. server-rendered).
     *
     * @returns {Promise<SystemResult<string | null>>} Launch URL or null.
     * @example
     * ```ts
     * const r = await provider.getCurrent();
     * ```
     */
    getCurrent: (): Promise<SystemResult<string | null>> =>
      Promise.resolve(ok(launchUrl, PROVIDER)),

    /**
     * Teardown — no-op; there is no OS listener to release on web.
     *
     * @returns {Promise<void>} Resolves immediately.
     * @example
     * ```ts
     * await provider.dispose();
     * ```
     */
    dispose: (): Promise<void> => Promise.resolve()
  };
}
