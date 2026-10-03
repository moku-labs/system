/**
 * @file haptics Tauri provider — `@tauri-apps/plugin-haptics` glue for iOS and Android. The
 * package is reached only through `await import("@tauri-apps/plugin-haptics")` inside the
 * factory body, so it stays a lazy import in dist.
 */
import type { LogApi } from "@moku-labs/common";
import type { SystemResult } from "../../runtime/result";
import { err, mapThrownToResult, ok } from "../../runtime/result";
import type { HapticsMethod, HapticsProvider } from "./types";

const PROVIDER = "tauri";

/**
 * What a haptics command resolves with (`Result` in the plugin's 2.4.1 `bindings.d.ts`). The
 * plugin turns a non-`Error` IPC rejection into `{ status: "error", error }` and rethrows only
 * an `Error`. `error` is the raw payload from the Rust side, so it stays `unknown` until
 * `String()` reads it.
 */
type CommandResult =
  | { readonly status: "ok" }
  | { readonly status: "error"; readonly error: unknown };

/** One call into the native plugin. `undefined` covers a binding that resolves void. */
type Command = () => Promise<CommandResult | undefined>;

/**
 * Convert a thrown value into an Error for ctx.log.error's typed `error` parameter.
 *
 * @param thrown - Whatever was thrown or rejected.
 * @returns The thrown value as an Error, wrapping a non-Error throw.
 * @example
 * ```ts
 * toError("ipc channel closed").message; // "ipc channel closed"
 * ```
 */
function toError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Run one native haptic and fold its outcome into a SystemResult. `status: "error"` is
 * logged and maps to "error" with the raw payload. A throw is logged and maps through
 * mapThrownToResult, so it is "error" and never "denied": an ACL refusal is ambiguous (D-004).
 *
 * @param log - ctx.log for the failure report (MC2).
 * @param method - The provider method, for the log entry.
 * @param command - The native call.
 * @returns ok when the plugin played the haptic, or a typed failure.
 * @example
 * ```ts
 * await play(log, "impact", () => impactFeedback("light")); // { ok: true, value: undefined, provider: "tauri" }
 * ```
 */
async function play(
  log: LogApi,
  method: HapticsMethod,
  command: Command
): Promise<SystemResult<void>> {
  let result: CommandResult | undefined;
  try {
    result = await command();
  } catch (error) {
    log.error("haptics:tauri-failed", { method }, toError(error));
    return mapThrownToResult(PROVIDER, error);
  }

  if (result?.status === "error") {
    log.error("haptics:tauri-failed", { method });
    return err(PROVIDER, "error", String(result.error));
  }

  return ok(undefined, PROVIDER);
}

/**
 * Create the Tauri haptics provider. The import runs here, so a missing peer rejects the load
 * (requirePeer names the package) and folds into "unavailable"; a method never throws.
 *
 * @param log - ctx.log for failure reports (MC2).
 * @returns The provider backed by the native haptics plugin.
 * @example
 * ```ts
 * const provider = await createTauriHapticsProvider(ctx.log);
 * await provider.notify("warning"); // { ok: true, value: undefined, provider: "tauri" }
 * ```
 */
export async function createTauriHapticsProvider(log: LogApi): Promise<HapticsProvider> {
  const { impactFeedback, notificationFeedback, selectionFeedback } = await import(
    "@tauri-apps/plugin-haptics"
  );

  return {
    /**
     * Play the native impact haptic (`impactFeedback`).
     *
     * @param kind - The tap strength, passed through as the Tauri style.
     * @returns ok when played, or a typed failure.
     * @example
     * ```ts
     * await provider.impact("light"); // { ok: true, value: undefined, provider: "tauri" }
     * ```
     */
    impact: kind => play(log, "impact", () => impactFeedback(kind)),

    /**
     * Play the native notification haptic (`notificationFeedback`).
     *
     * @param kind - The outcome, passed through as the Tauri type.
     * @returns ok when played, or a typed failure.
     * @example
     * ```ts
     * await provider.notify("error"); // { ok: true, value: undefined, provider: "tauri" }
     * ```
     */
    notify: kind => play(log, "notify", () => notificationFeedback(kind)),

    /**
     * Play the native selection haptic (`selectionFeedback`).
     *
     * @returns ok when played, or a typed failure.
     * @example
     * ```ts
     * await provider.selection(); // { ok: true, value: undefined, provider: "tauri" }
     * ```
     */
    selection: () => play(log, "selection", selectionFeedback),

    /**
     * Teardown. A no-op: a haptic holds no OS resource.
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
