/**
 * @file haptics web provider — `navigator.vibrate` patterns. Feature-probed once at factory
 * time: no `vibrate` (iOS Safari, WKWebView, SSR) → the shared unsupported stand-in. No
 * browser global is read at module scope (SSR-safe).
 */
import type { LogApi } from "@moku-labs/common";
import type { SystemResult } from "../../runtime/result";
import { err, mapThrownToResult, ok, unsupportedProvider } from "../../runtime/result";
import type { ImpactKind, NotifyKind } from "../types";
import type { HapticsMethod, HapticsProvider } from "./types";
import { HAPTICS_METHODS } from "./types";

const PROVIDER = "web";

/** Why a browser answered `false`: vibration needs sticky user activation (P16). */
const REFUSED_MESSAGE = "vibrate refused — needs a user gesture first";

/** A vibration pattern in milliseconds: one pulse, or pulse, pause, pulse, … */
type VibratePattern = number | readonly number[];

/** The pattern table: one row per haptic call. */
type PatternTable = {
  readonly impact: Readonly<Record<ImpactKind, VibratePattern>>;
  readonly notify: Readonly<Record<NotifyKind, VibratePattern>>;
  readonly selection: VibratePattern;
};

/** Vibration patterns (ms). A number is one pulse; an array alternates pulse and pause. */
const PATTERNS: PatternTable = {
  impact: { light: 10, medium: 20, heavy: 35 },
  notify: { success: [15, 60, 15], warning: [30, 60, 30], error: [40, 60, 40, 60, 40] },
  selection: 5
};

/**
 * The `navigator` slice this provider reads. The package compiles without the DOM lib, so
 * `vibrate` is declared here as a local structural type.
 */
type VibrateNavigator = { vibrate?: (pattern: VibratePattern) => boolean };

/** A navigator that can vibrate. Calls go through it, so the browser sees `this === navigator`. */
type VibrateHost = Required<VibrateNavigator>;

/**
 * Whether a navigator can vibrate.
 *
 * @param candidate - The navigator slice to probe.
 * @returns True when `vibrate` is a function.
 * @example
 * ```ts
 * isVibrateHost({}); // false: iOS Safari has no vibrate
 * ```
 */
function isVibrateHost(candidate: VibrateNavigator): candidate is VibrateHost {
  return typeof candidate.vibrate === "function";
}

/**
 * Read the global `navigator` when it can vibrate.
 *
 * @returns The navigator, or undefined when there is none (SSR) or it has no `vibrate`.
 * @example
 * ```ts
 * readVibrateHost(); // undefined in iOS Safari and during SSR; navigator in Android Chrome
 * ```
 */
function readVibrateHost(): VibrateHost | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  const candidate = navigator as unknown as VibrateNavigator;
  return isVibrateHost(candidate) ? candidate : undefined;
}

/**
 * Convert a thrown value into an Error for ctx.log.error's typed `error` parameter.
 *
 * @param thrown - Whatever was thrown.
 * @returns The thrown value as an Error, wrapping a non-Error throw.
 * @example
 * ```ts
 * toError("vibration blocked").message; // "vibration blocked"
 * ```
 */
function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Play one pattern. `false` from the browser means no user gesture yet, so the result is
 * "unavailable" and nothing is logged. A throw is a fault: logged, then "error".
 *
 * @param log - ctx.log for the failure report (MC2).
 * @param host - The navigator that can vibrate.
 * @param method - The provider method, for the log entry.
 * @param pattern - The pattern to play, in ms.
 * @returns ok when the browser accepted the pattern, or a typed failure.
 * @example
 * ```ts
 * // Before the first tap on the page the browser refuses:
 * await vibrate(log, navigator, "selection", 5);
 * // { ok: false, provider: "web", reason: "unavailable", message: "vibrate refused — needs a user gesture first" }
 * ```
 */
async function vibrate(
  log: LogApi,
  host: VibrateHost,
  method: HapticsMethod,
  pattern: VibratePattern
): Promise<SystemResult<void>> {
  let accepted: boolean;
  try {
    accepted = host.vibrate(pattern);
  } catch (error) {
    log.error("haptics:web-failed", { method }, toError(error));
    return mapThrownToResult(PROVIDER, error);
  }

  if (!accepted) {
    return err(PROVIDER, "unavailable", REFUSED_MESSAGE);
  }

  return ok(undefined, PROVIDER);
}

/**
 * Create the web haptics provider. Without `navigator.vibrate` every method answers
 * "unsupported" through the shared stand-in.
 *
 * @param log - ctx.log for failure reports (MC2).
 * @returns The provider backed by `navigator.vibrate`.
 * @example
 * ```ts
 * const provider = await createWebHapticsProvider(ctx.log);
 * await provider.impact("light"); // { ok: false, provider: "web", reason: "unsupported" } in iOS Safari
 * ```
 */
export async function createWebHapticsProvider(log: LogApi): Promise<HapticsProvider> {
  const host = readVibrateHost();
  if (host === undefined) {
    return unsupportedProvider(PROVIDER, HAPTICS_METHODS);
  }

  return {
    /**
     * Vibrate the impact pattern: 10, 20 or 35 ms.
     *
     * @param kind - The tap strength.
     * @returns ok when the browser accepted the pattern, or a typed failure.
     * @example
     * ```ts
     * await provider.impact("heavy"); // vibrates 35 ms: { ok: true, value: undefined, provider: "web" }
     * ```
     */
    impact: kind => vibrate(log, host, "impact", PATTERNS.impact[kind]),

    /**
     * Vibrate the outcome pattern from the table.
     *
     * @param kind - The outcome.
     * @returns ok when the browser accepted the pattern, or a typed failure.
     * @example
     * ```ts
     * await provider.notify("success"); // vibrates [15, 60, 15]: { ok: true, value: undefined, provider: "web" }
     * ```
     */
    notify: kind => vibrate(log, host, "notify", PATTERNS.notify[kind]),

    /**
     * Vibrate the 5 ms selection tick.
     *
     * @returns ok when the browser accepted the pattern, or a typed failure.
     * @example
     * ```ts
     * await provider.selection(); // vibrates 5 ms: { ok: true, value: undefined, provider: "web" }
     * ```
     */
    selection: () => vibrate(log, host, "selection", PATTERNS.selection),

    /**
     * Teardown. A no-op: a vibration holds no resource.
     *
     * @returns Resolves immediately.
     * @example
     * ```ts
     * await provider.dispose(); // undefined
     * ```
     */
    dispose: () => Promise.resolve()
  };
}
