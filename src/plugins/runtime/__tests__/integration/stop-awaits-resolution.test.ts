/* eslint-disable unicorn/no-null -- ResolutionState.provider is typed `Promise<...> | null` per the
   seam contract (spec/01-runtime.md); the probe plugin below builds that state shape directly. */
import { describe, expect, it } from "vitest";

import { createApp, createPlugin } from "../../../../index";
import type { CapabilityProvider, ResolutionState } from "../../provider";
import { startResolution, stopResolution } from "../../provider";

/**
 * Test helper — a promise that settles one macrotask later, i.e. strictly after every
 * pending microtask has drained.
 */
function nextMacrotask(): Promise<void> {
  return new Promise<void>(resolve => {
    setTimeout(resolve, 0);
  });
}

describe("app.stop() with a provider resolution in flight", () => {
  it("resolves only after the late-arriving provider was disposed", async () => {
    const order: string[] = [];
    let resolveLoad: ((provider: CapabilityProvider) => void) | undefined;
    const lateProvider: CapabilityProvider = {
      dispose: async (): Promise<void> => {
        await nextMacrotask();
        order.push("provider disposed");
      }
    };

    const probePlugin = createPlugin("probe", {
      createState: (): ResolutionState<CapabilityProvider> => ({ provider: null }),
      /**
       * Start a resolution that stays in flight until onStop releases it.
       *
       * @param {object} ctx - Plugin context (global + state + runtime).
       * @example
       * ```ts
       * await app.start(); // provider still resolving
       * ```
       */
      onStart: ctx => {
        startResolution(
          ctx.runtime.kind,
          ctx,
          () =>
            new Promise<CapabilityProvider>(resolve => {
              resolveLoad = resolve;
            })
        );
      },
      /**
       * Tear down through the shared seam helper, releasing the load only once the stop
       * sentinel is set — so the resolution is genuinely in flight at that moment.
       *
       * @param {object} ctx - Teardown context (global + own config and state).
       * @returns {Promise<void>} Resolves once teardown completed.
       * @example
       * ```ts
       * await app.stop();
       * ```
       */
      onStop: ctx => {
        const stopping = stopResolution("probe", ctx);
        resolveLoad?.(lateProvider);
        return stopping;
      }
    });

    const app = createApp({ plugins: [probePlugin] });
    await app.start();

    await app.stop();
    order.push("stop() resolved");

    expect(order).toEqual(["provider disposed", "stop() resolved"]);
  });
});
