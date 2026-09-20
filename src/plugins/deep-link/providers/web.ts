/**
 * @file deep-link web provider — launch URL only (no push deliveries in v1: PWA
 * `protocol_handlers`/`launchQueue` require installed-PWA manifest config outside this
 * framework's runtime scope). A launch URL exists only when the page URL carries an
 * explicit `deeplink` parameter (`?deeplink=` or `#deeplink=`); the page's own address
 * is not a deep link. That parameter is attacker-controlled, so a value carrying an
 * executable or local scheme (`javascript:`, `data:`, `vbscript:`, `blob:`, `file:`) is
 * refused here, before the configured scheme allowlist in the plugin layer ever sees it.
 * No browser globals at module scope (SSR-safe) — `location` is read inside the factory
 * body, not at import time.
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

/** Query/hash parameter a web page uses to hand this app a deep link. */
const DEEP_LINK_PARAMETER = /[?#&]deeplink=([^&#]*)/;

/**
 * Schemes that execute code or reach the local machine. The `deeplink` parameter is
 * attacker-controlled — anyone can mail a link to this app's own origin — so a value
 * carrying one of these is refused outright, before the configured scheme allowlist
 * ever sees it. An app running with an empty allowlist must still never hand its router
 * a `javascript:` URL.
 */
const REJECTED_SCHEMES = new Set(["javascript", "data", "vbscript", "blob", "file"]);

/** Leading scheme of a URL, for the hard reject below. */
const SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

/**
 * Read the deep link a page URL carries in `?deeplink=` or `#deeplink=`. The value is
 * percent-encoded by whoever built the link; a malformed encoding is reported at debug
 * level and treated as "no launch URL" rather than thrown at the caller. The decoded
 * value is trimmed, then refused when it carries an executable or local scheme.
 *
 * @param {string} href - The page URL.
 * @param {LogApi} log - ctx.log for reporting a rejected or undecodable parameter (MC2).
 * @returns {string | null} The decoded deep link, or null when the page carries none.
 * @example
 * ```ts
 * readDeepLinkParameter("https://a.test/?deeplink=myapp%3A%2F%2Fopen", log); // "myapp://open"
 * ```
 */
function readDeepLinkParameter(href: string, log: LogApi): string | null {
  const raw = DEEP_LINK_PARAMETER.exec(href)?.[1];
  if (raw === undefined || raw === "") {
    // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — no deep-link data on this page
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw).trim();
  } catch {
    log.debug("deepLink:web-launch-undecodable", { raw });
    // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — the parameter could not be decoded
    return null;
  }

  const scheme = SCHEME_PATTERN.exec(decoded)?.[1]?.toLowerCase();
  if (scheme !== undefined && REJECTED_SCHEMES.has(scheme)) {
    log.debug("deepLink:web-launch-rejected", { scheme });
    // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — executable/local scheme refused
    return null;
  }

  if (decoded === "") {
    // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — a whitespace-only parameter carries no deep link
    return null;
  }

  return decoded;
}

/**
 * Create the web deep-link provider: getCurrent reflects the launch URL captured at
 * construction time; dispose is a no-op (no OS listener exists on web).
 *
 * @param {DeepLinkConfig} _config - Resolved config (scheme allowlist; filtering happens
 *   in the plugin layer, not here).
 * @param {LogApi} log - ctx.log for reporting an undecodable deep-link parameter (MC2).
 * @returns {Promise<DeepLinkProvider>} The web-backed deep-link provider.
 * @example
 * ```ts
 * const provider = await createWebDeepLinkProvider(config, log);
 * ```
 */
export async function createWebDeepLinkProvider(
  _config: DeepLinkConfig,
  log: LogApi
): Promise<DeepLinkProvider> {
  // `location` is a real DOM/browser global with no ambient declaration under this
  // project's DOM-lib-free tsconfig — narrowed immediately via a local structural
  // type (R9's "real boundary, narrowed before use" carve-out), never `any`.
  const globalScope = globalThis as { location?: WebLocation };
  const launchUrl =
    globalScope.location === undefined
      ? // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — no location global (SSR)
        null
      : readDeepLinkParameter(globalScope.location.href, log);

  return {
    /**
     * The deep link the page URL carried in `?deeplink=`/`#deeplink=`; null when the
     * page carries none (an ordinary page visit) or there is no location (SSR).
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
