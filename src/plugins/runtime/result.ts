/**
 * @file SystemResult contract — the public outcome type every capability method returns,
 * plus its construction helpers. Public surface re-exported through src/index.ts (D-008).
 */

/** The active shell kind a provider was selected for. */
export type RuntimeKind = "tauri" | "web";

/** OS platform within the kind. "unknown" is the honest fallback (incl. SSR). */
export type RuntimePlatform = "macos" | "windows" | "linux" | "ios" | "android" | "unknown";

/** JSON-safe primitive. */
export type JsonPrimitive = string | number | boolean | null;

/**
 * Cross-provider value domain for store — JSON files and structured clone round-trip
 * Date/Map/etc. differently, so both providers accept only JSON-safe values.
 *
 * @example
 * ```ts
 * const v: JsonValue = { items: [1, "two", null], nested: { ok: true } };
 * ```
 */
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/** Why a capability call did not succeed. */
export type SystemErrorReason = "unsupported" | "denied" | "unavailable" | "error";

/**
 * Successful outcome.
 *
 * @example
 * ```ts
 * const r: SystemOk<number> = { ok: true, value: 42, provider: "web" };
 * ```
 */
export type SystemOk<T> = { ok: true; value: T; provider: RuntimeKind };

/**
 * Failed outcome — degraded, denied, absent, or errored, as typed data.
 *
 * @example
 * ```ts
 * const r: SystemErr = { ok: false, provider: "web", reason: "denied" };
 * ```
 */
// eslint-disable-next-line unicorn/prevent-abbreviations -- SystemErr is the approved public contract name (skeleton spec)
export type SystemErr = {
  ok: false;
  provider: RuntimeKind;
  reason: SystemErrorReason;
  message?: string;
};

/**
 * The uniform outcome contract for every capability method — never a thrown surprise
 * inside a webview. Programmer errors still throw normally.
 *
 * @example
 * ```ts
 * const r = await system.store.get<number>("count");
 * if (r.ok) use(r.value); else if (r.reason === "unsupported") hideFeature();
 * ```
 */
export type SystemResult<T> = SystemOk<T> | SystemErr;

/**
 * Construct a success outcome.
 *
 * @param {T} _value - The result value.
 * @param {RuntimeKind} _provider - The provider that produced it.
 * @example
 * ```ts
 * return ok(items, "web");
 * ```
 */
export function ok<T>(_value: T, _provider: RuntimeKind): SystemOk<T> {
  throw new Error("not implemented");
}

/**
 * Construct a failure outcome.
 *
 * @param {RuntimeKind} _provider - The active provider.
 * @param {SystemErrorReason} _reason - Typed failure reason.
 * @param {string} [_message] - Raw diagnostic text (preserved, also logged by callers via ctx.log).
 * @example
 * ```ts
 * return err("tauri", "unavailable", "plugin not registered");
 * ```
 */
export function err(
  _provider: RuntimeKind,
  _reason: SystemErrorReason,
  _message?: string
): SystemErr {
  throw new Error("not implemented");
}

/**
 * Fold any thrown/rejected value into a SystemErr, preserving the raw message.
 * NEVER produces "denied" — Tauri ACL throws are ambiguous (D-004); "denied" is
 * reserved for unambiguous returned permission signals.
 *
 * @param {RuntimeKind} _provider - The active provider.
 * @param {unknown} _thrown - Whatever was thrown or rejected.
 * @param {"error" | "unavailable"} [_reason] - Mapping target; resolution paths pass "unavailable", method paths default "error".
 * @example
 * ```ts
 * catch (error) { return mapThrownToResult("tauri", error); }
 * ```
 */
export function mapThrownToResult(
  _provider: RuntimeKind,
  _thrown: unknown,
  _reason?: Extract<SystemErrorReason, "error" | "unavailable">
): SystemErr {
  throw new Error("not implemented");
}

/**
 * Mechanically produce a provider whose every listed method resolves to
 * err(provider, "unsupported"), plus a no-op dispose(). The single source for BOTH
 * absence cases: unsupported-by-kind (tray on web) and unsupported-by-platform-within-kind
 * (tray on Tauri mobile).
 *
 * @param {RuntimeKind} _provider - The provider kind reported in every error.
 * @param {readonly M[]} _methods - Method names the returned object must expose.
 * @example
 * ```ts
 * const webTray = unsupportedProvider("web", ["setMenu", "setTooltip", "setIcon", "destroy"]) satisfies TrayProvider;
 * ```
 */
export function unsupportedProvider<M extends string>(
  _provider: RuntimeKind,
  _methods: readonly M[]
): Record<M, (...args: never[]) => Promise<SystemErr>> & { dispose: () => Promise<void> } {
  throw new Error("not implemented");
}
