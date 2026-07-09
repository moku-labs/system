import { createCoreConfig } from "@moku-labs/core";
import { describe, expect, expectTypeOf, it } from "vitest";

import { runtimePlugin } from "../../index";
import type { RuntimeApi } from "../../types";

describe("runtime core plugin integration", () => {
  it("injects ctx.runtime on a regular plugin's context and on the app itself", () => {
    const coreConfig = createCoreConfig<
      Record<string, never>,
      Record<string, never>,
      [typeof runtimePlugin]
    >("test-app", { config: {}, plugins: [runtimePlugin] });
    let captured: RuntimeApi | undefined;
    const probePlugin = coreConfig.createPlugin("probe", {
      api: ctx => {
        captured = { kind: ctx.runtime.kind, platform: ctx.runtime.platform };
        return {};
      }
    });
    const framework = coreConfig.createCore(coreConfig, { plugins: [probePlugin] });

    const app = framework.createApp();

    expect(captured).toBeDefined();
    expect(["tauri", "web"]).toContain(captured?.kind);
    expect(app.runtime.kind).toBe(captured?.kind);
    expectTypeOf(app.runtime).toEqualTypeOf<RuntimeApi>();
  });

  it("applies forceKind/forcePlatform overrides supplied via createCoreConfig pluginConfigs", () => {
    const coreConfig = createCoreConfig<
      Record<string, never>,
      Record<string, never>,
      [typeof runtimePlugin]
    >("test-app-forced", {
      config: {},
      plugins: [runtimePlugin],
      pluginConfigs: { runtime: { forceKind: "web", forcePlatform: "linux" } }
    });
    const framework = coreConfig.createCore(coreConfig, { plugins: [] });

    const app = framework.createApp();

    expect(app.runtime).toEqual({ kind: "web", platform: "linux" });
  });

  // eslint-disable-next-line sonarjs/assertions-in-tests -- compile-time-only check; @ts-expect-error below IS the assertion
  it("rejects an invalid forced kind at compile time", () => {
    createCoreConfig<Record<string, never>, Record<string, never>, [typeof runtimePlugin]>(
      "test-app-invalid",
      {
        config: {},
        plugins: [runtimePlugin],
        // @ts-expect-error — "electron" is not a valid RuntimeKind
        pluginConfigs: { runtime: { forceKind: "electron" } }
      }
    );
  });
});
