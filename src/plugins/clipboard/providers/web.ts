/**
 * @file clipboard web provider — navigator.clipboard. Feature-probed (no
 * permissions.query); NotAllowedError → "denied". No browser globals at module scope
 * (SSR-safe).
 */
import type { LogApi } from "@moku-labs/common";
import type { SystemResult } from "../../runtime/result";
import { err, mapThrownToResult, ok, unsupportedProvider } from "../../runtime/result";
import type { ClipboardProvider } from "./types";
import { CLIPBOARD_METHODS } from "./types";

const PROVIDER = "web";

/**
 * Structural shape of the `navigator.clipboard` surface this provider uses. The
 * ambient `Navigator` type in this isomorphic package's toolchain (bun-types and the
 * Node web-globals types) intentionally excludes DOM lib, so it has no `clipboard`
 * member — this local type fills that gap without pulling in `lib.dom` or
 * re-exporting a DOM type.
 */
type ClipboardNavigator = {
  clipboard?: {
    readText?: () => Promise<string>;
    writeText?: (text: string) => Promise<void>;
  };
};

/**
 * Read `navigator.clipboard` through the local structural type, undefined when
 * `navigator` itself is absent (SSR) or `clipboard` was never populated.
 *
 * @returns {ClipboardNavigator["clipboard"]} The clipboard surface, or undefined.
 * @example
 * ```ts
 * const clipboard = readNavigatorClipboard();
 * ```
 */
function readNavigatorClipboard(): ClipboardNavigator["clipboard"] {
  if (typeof navigator === "undefined") {
    return undefined;
  }
  return (navigator as unknown as ClipboardNavigator).clipboard;
}

/**
 * Convert a thrown/rejected value into an Error for ctx.log.error's typed `error` param.
 *
 * @param {unknown} thrown - Whatever was thrown or rejected.
 * @returns {Error} The thrown value as an Error, wrapping non-Error throws.
 * @example
 * ```ts
 * catch (error) { log.error("clipboard:web-read-failed", undefined, toError(error)); }
 * ```
 */
function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Duck-type the one unambiguous web-side "denied" signal: a rejection whose `name` is
 * `"NotAllowedError"`. Matched on the property, not `instanceof DOMException` — this
 * package compiles without the DOM lib, and a webview that never populated the
 * `DOMException` global still rejects with a `name`-carrying object.
 *
 * @param {unknown} thrown - Whatever was thrown or rejected.
 * @returns {boolean} True when the rejection is a permission denial.
 * @example
 * ```ts
 * isNotAllowedError(new DOMException("denied", "NotAllowedError")); // true
 * ```
 */
function isNotAllowedError(
  thrown: unknown
): thrown is { readonly name: string; readonly message?: unknown } {
  return (
    typeof thrown === "object" &&
    thrown !== null &&
    "name" in thrown &&
    thrown.name === "NotAllowedError"
  );
}

/**
 * Map a thrown clipboard error to a SystemResult failure. A `NotAllowedError`
 * rejection is the one unambiguous web-side "denied" signal; every other throw
 * maps to "error" (D-004 — never guess "denied" from an ambiguous throw).
 *
 * @param {LogApi} log - ctx.log for error reporting (MC2).
 * @param {string} logKey - The log event key for this call site.
 * @param {unknown} thrown - Whatever was thrown or rejected.
 * @returns {SystemResult<never>} The mapped failure.
 * @example
 * ```ts
 * catch (error) { return mapClipboardThrow(log, "clipboard:web-read-failed", error); }
 * ```
 */
function mapClipboardThrow(log: LogApi, logKey: string, thrown: unknown): SystemResult<never> {
  if (isNotAllowedError(thrown)) {
    return err(PROVIDER, "denied", typeof thrown.message === "string" ? thrown.message : undefined);
  }
  log.error(logKey, undefined, toError(thrown));
  return mapThrownToResult(PROVIDER, thrown);
}

/**
 * Create the web clipboard provider. Missing navigator.clipboard yields the
 * unsupported branch (CLIPBOARD_METHODS via unsupportedProvider); a present but
 * partial navigator.clipboard (e.g. Firefox lacking readText) reports per-method.
 *
 * @param {LogApi} log - ctx.log for error reporting (MC2).
 * @returns {Promise<ClipboardProvider>} The navigator.clipboard-backed provider.
 * @example
 * ```ts
 * const provider = await createWebClipboardProvider(log);
 * ```
 */
export async function createWebClipboardProvider(log: LogApi): Promise<ClipboardProvider> {
  const clipboard = readNavigatorClipboard();
  if (!clipboard) {
    return unsupportedProvider(PROVIDER, CLIPBOARD_METHODS);
  }

  return {
    /**
     * Read the current clipboard text via navigator.clipboard.readText().
     *
     * @returns {Promise<SystemResult<string>>} Clipboard contents or a typed failure.
     * @example
     * ```ts
     * const r = await provider.readText();
     * ```
     */
    readText: async (): Promise<SystemResult<string>> => {
      if (typeof clipboard.readText !== "function") {
        return err(PROVIDER, "unsupported");
      }
      try {
        const text = await clipboard.readText();
        return ok(text, PROVIDER);
      } catch (error) {
        return mapClipboardThrow(log, "clipboard:web-read-failed", error);
      }
    },

    /**
     * Write text to the clipboard via navigator.clipboard.writeText().
     *
     * @param {string} text - Text to write.
     * @returns {Promise<SystemResult<void>>} ok when written.
     * @example
     * ```ts
     * const r = await provider.writeText("copy me");
     * ```
     */
    writeText: async (text: string): Promise<SystemResult<void>> => {
      if (typeof clipboard.writeText !== "function") {
        return err(PROVIDER, "unsupported");
      }
      try {
        await clipboard.writeText(text);
        return ok(undefined, PROVIDER);
      } catch (error) {
        return mapClipboardThrow(log, "clipboard:web-write-failed", error);
      }
    },

    /**
     * Teardown — no-op; there is no OS artifact to release for the web provider.
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
