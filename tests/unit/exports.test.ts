import { describe, expect, it } from "vitest";
import * as root from "../../src/index";
import * as pluginBarrel from "../../src/plugins/index";

const CAPABILITY_INSTANCES = [
  "storePlugin",
  "trayPlugin",
  "notifyPlugin",
  "clipboardPlugin",
  "deepLinkPlugin"
];

describe("package export surface", () => {
  describe("root entry (zero-leak subpaths)", () => {
    it("exports exactly createApp, createPlugin, ok and err at runtime", () => {
      expect(Object.keys(root).toSorted()).toEqual(["createApp", "createPlugin", "err", "ok"]);
    });

    it("exports no plugin instance — capabilities ship from their subpath entries", () => {
      const exported = new Set(Object.keys(root));
      for (const instance of CAPABILITY_INSTANCES) {
        expect(exported.has(instance)).toBe(false);
      }
    });
  });

  describe("src/plugins barrel", () => {
    it("re-exports every plugin instance in the source tree", () => {
      expect(Object.keys(pluginBarrel).toSorted()).toEqual([
        "clipboardPlugin",
        "deepLinkPlugin",
        "notifyPlugin",
        "runtimePlugin",
        "storePlugin",
        "trayPlugin"
      ]);
    });

    it("re-exports the instances themselves, not copies", async () => {
      const { storePlugin } = await import("../../src/store");
      expect(pluginBarrel.storePlugin).toBe(storePlugin);
    });
  });
});

describe("runtime core-plugin config from createApp", () => {
  it("applies pluginConfigs.runtime passed to createApp", async () => {
    const probePlugin = root.createPlugin("runtimeProbe", {
      // A config of its own, so `pluginConfigs` below carries both a capability-style key
      // and the core-plugin key — the shape a consumer actually writes.
      config: { label: "probe" },
      api: ctx => ({
        /**
         * Report the runtime detection the kernel resolved for this app.
         *
         * @returns {object} The detected (or forced) kind and platform.
         * @example
         * ```ts
         * app.runtimeProbe.snapshot(); // { kind: "web", platform: "windows" }
         * ```
         */
        snapshot: (): { kind: string; platform: string } => ({
          kind: ctx.runtime.kind,
          platform: ctx.runtime.platform
        })
      })
    });

    // Hoisted, not inlined: `runtime` is a core plugin, so it is not one of the typed
    // `pluginConfigs` keys of createApp. A hoisted object is not "fresh", so TypeScript
    // accepts the extra key — and the kernel applies it (consumer configs win the cascade).
    // forcePlatform "windows" cannot come from auto-detection on this host, so observing it
    // proves the createApp-level override reached the runtime core plugin.
    const pluginConfigs = {
      runtimeProbe: { label: "composed" },
      runtime: { forceKind: "web", forcePlatform: "windows" }
    } as const;

    const app = root.createApp({ plugins: [probePlugin], pluginConfigs });
    await app.start();

    expect(app.runtimeProbe.snapshot()).toEqual({ kind: "web", platform: "windows" });

    await app.stop();
  });
});
