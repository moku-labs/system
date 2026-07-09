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
 * @param {T} value - The result value.
 * @param {RuntimeKind} provider - The provider that produced it.
 * @returns The success outcome.
 * @example
 * ```ts
 * return ok(items, "web");
 * ```
 */
export function ok<T>(value: T, provider: RuntimeKind): SystemOk<T> {
  return { ok: true, value, provider };
}

/**
 * Construct a failure outcome.
 *
 * @param {RuntimeKind} provider - The active provider.
 * @param {SystemErrorReason} reason - Typed failure reason.
 * @param {string} [message] - Raw diagnostic text (preserved, also logged by callers via ctx.log).
 * @returns The failure outcome.
 * @example
 * ```ts
 * return err("tauri", "unavailable", "plugin not registered");
 * ```
 */
export function err(provider: RuntimeKind, reason: SystemErrorReason, message?: string): SystemErr {
  return message === undefined
    ? { ok: false, provider, reason }
    : { ok: false, provider, reason, message };
}

/**
 * Fold any thrown/rejected value into a SystemErr, preserving the raw message.
 * NEVER produces "denied" — Tauri ACL throws are ambiguous (D-004); "denied" is
 * reserved for unambiguous returned permission signals.
 *
 * @param {RuntimeKind} provider - The active provider.
 * @param {unknown} thrown - Whatever was thrown or rejected.
 * @param {"error" | "unavailable"} [reason] - Mapping target; resolution paths pass "unavailable", method paths default "error".
 * @returns The failure outcome, with the raw message preserved.
 * @example
 * ```ts
 * catch (error) { return mapThrownToResult("tauri", error); }
 * ```
 */
export function mapThrownToResult(
  provider: RuntimeKind,
  thrown: unknown,
  reason: Extract<SystemErrorReason, "error" | "unavailable"> = "error"
): SystemErr {
  const message = extractThrownMessage(thrown);
  return message === undefined ? err(provider, reason) : err(provider, reason, message);
}

/**
 * Best-effort extraction of a diagnostic message from any thrown/rejected shape.
 *
 * @param {unknown} thrown - Whatever was thrown or rejected.
 * @returns The raw message, or undefined when nothing was thrown.
 * @example
 * ```ts
 * extractThrownMessage(new Error("boom")); // "boom"
 * ```
 */
function extractThrownMessage(thrown: unknown): string | undefined {
  if (thrown instanceof Error) {
    return thrown.message;
  }
  if (typeof thrown === "string") {
    return thrown;
  }
  return thrown === undefined ? undefined : String(thrown);
}

/**
 * Mechanically produce a provider whose every listed method resolves to
 * err(provider, "unsupported"), plus a no-op dispose(). The single source for BOTH
 * absence cases: unsupported-by-kind (tray on web) and unsupported-by-platform-within-kind
 * (tray on Tauri mobile).
 *
 * @param {RuntimeKind} provider - The provider kind reported in every error.
 * @param {readonly M[]} methods - Method names the returned object must expose.
 * @returns A structural stand-in provider whose methods all report "unsupported".
 * @example
 * ```ts
 * const webTray = unsupportedProvider("web", ["setMenu", "setTooltip", "setIcon", "destroy"]) satisfies TrayProvider;
 * ```
 */
export function unsupportedProvider<M extends string>(
  provider: RuntimeKind,
  methods: readonly M[]
): Record<M, (...args: never[]) => Promise<SystemErr>> & { dispose: () => Promise<void> } {
  const unsupportedMethod = reportUnsupported.bind(undefined, provider);
  const entries: Partial<Record<M, (...args: never[]) => Promise<SystemErr>>> = {};
  for (const method of methods) {
    entries[method] = unsupportedMethod;
  }
  // The loop above guarantees every key in `methods` is populated, so narrowing
  // the partial record back to `Record<M, …>` is safe.
  const record = entries as Record<M, (...args: never[]) => Promise<SystemErr>>;
  return { ...record, dispose: resolveVoid };
}

/**
 * Shared "unsupported" method implementation reused by every stand-in provider
 * method — bound with the provider kind so no per-method closure is allocated.
 *
 * @param {RuntimeKind} provider - The provider kind reported in the error.
 * @returns The provider's "unsupported" failure result.
 * @example
 * ```ts
 * const method = reportUnsupported.bind(undefined, "web");
 * await method(); // => { ok: false, provider: "web", reason: "unsupported" }
 * ```
 */
function reportUnsupported(provider: RuntimeKind): Promise<SystemErr> {
  return Promise.resolve(err(provider, "unsupported"));
}

/**
 * No-op teardown for an unsupported-capability stand-in provider.
 *
 * @returns Resolves immediately — there is nothing to tear down.
 * @example
 * ```ts
 * await unsupportedProvider("web", []).dispose();
 * ```
 */
function resolveVoid(): Promise<void> {
  return Promise.resolve();
}
