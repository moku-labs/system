/**
 * @file lifecycle providers — resolver. Selection branches once on ctx.runtime.kind inside the
 * returned load closure (D-012); the sources are wired onto the signal at factory time, as the
 * deep-link push channel is. Only ./web is statically imported: ./tauri is reached through a
 * dynamic `import()`, so the `@tauri-apps/api/event` specifier stays in a code-split chunk a
 * pure-web bundle never has to resolve. No requirePeer: a missing `@tauri-apps/api` only warns
 * inside the Tauri provider, which still resolves on its visibility source (D-S02).
 */
import type { LifecycleContext } from "../types";
import type { LifecycleProvider, LifecycleSignal } from "./types";
import { createWebLifecycleProvider } from "./web";

/**
 * Build the load closure passed to startResolution. kind "tauri" (every platform) →
 * visibility plus the native suspend/resume events; otherwise → visibility only.
 *
 * @param {LifecycleContext} ctx - Lifecycle domain context (runtime + log).
 * @param {LifecycleSignal} signal - Where every source reports a phase (createSignal).
 * @returns {() => Promise<LifecycleProvider>} The load closure for the selected provider.
 * @example
 * ```ts
 * // ctx.runtime is { kind: "web", platform: "macos" }: visibility only, no native events.
 * const provider = await loadLifecycleProvider(ctx, phase => phases.push(phase))();
 * // the tab hides: phases is ["pause"]
 * await provider.dispose(); // resolves undefined: later tab switches report nothing
 * ```
 */
export function loadLifecycleProvider(
  ctx: LifecycleContext,
  signal: LifecycleSignal
): () => Promise<LifecycleProvider> {
  if (ctx.runtime.kind === "tauri") {
    return async () => {
      const { createTauriLifecycleProvider } = await import("./tauri");
      return createTauriLifecycleProvider(ctx.log, signal);
    };
  }
  return () => createWebLifecycleProvider(signal);
}
