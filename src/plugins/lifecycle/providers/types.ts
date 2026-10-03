/**
 * @file lifecycle providers — structural provider contract and the signal every source reports
 * to. No `@tauri-apps` types appear here.
 */

/**
 * A transition a lifecycle source reports: the app went to background, or came back.
 */
export type LifecyclePhase = "pause" | "resume";

/**
 * Where every lifecycle source reports a phase. Built once per app by `createSignal`
 * (`api.ts`), which dedupes on transition, and handed to the provider factory, which wires its
 * sources onto it.
 */
export type LifecycleSignal = (phase: LifecyclePhase) => void;

/**
 * Structural lifecycle provider contract (satisfies CapabilityProvider via dispose). A provider
 * has no methods of its own: its sources are wired onto the signal at factory time, so teardown
 * is its whole surface.
 *
 * Method-shorthand syntax, as the other capability providers use.
 *
 * @example
 * ```ts
 * const stopWatching = watchVisibility(phase => signal(phase));
 * const provider: LifecycleProvider = { dispose: async () => stopWatching() };
 * ```
 */
export type LifecycleProvider = {
  /** Removes every listener the provider added. Idempotent. */
  dispose(): Promise<void>;
};
