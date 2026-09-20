import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { coreConfig } from "../../src/config";
import { createApp } from "../../src/index";
import { clipboardPlugin } from "../../src/plugins/clipboard";
import { deepLinkPlugin } from "../../src/plugins/deep-link";
import type { DeepLinkConfig } from "../../src/plugins/deep-link/types";
import { notifyPlugin } from "../../src/plugins/notify";
import type { RuntimeConfig } from "../../src/plugins/runtime/types";
import { storePlugin } from "../../src/plugins/store";
import type { StoreConfig } from "../../src/plugins/store/types";
import { trayPlugin } from "../../src/plugins/tray";
import type { TrayConfig } from "../../src/plugins/tray/types";

type SystemOverrides = {
  runtime?: Partial<RuntimeConfig>;
  store?: Partial<StoreConfig>;
  deepLink?: Partial<DeepLinkConfig>;
  tray?: Partial<TrayConfig>;
};

/**
 * Framework-internal integration bootstrap (house style: framework tests may
 * import/reuse `coreConfig` directly). Registers ALL FIVE capability plugins and
 * forces `ctx.runtime` via the loosely-typed `createCore`-level `pluginConfigs`
 * (core-plugin overrides are only reachable at the createCoreConfig/createCore
 * level, never from createApp — see runtime/README.md).
 */
function buildFullApp(overrides: SystemOverrides = {}) {
  const framework = coreConfig.createCore(coreConfig, {
    plugins: [storePlugin, notifyPlugin, clipboardPlugin, trayPlugin, deepLinkPlugin],
    pluginConfigs: overrides
  });
  return framework.createApp();
}

/** A Notification-global fake matching the structural shape notify's web provider reads. */
function createFakeNotificationCtor(permission: "default" | "denied" | "granted") {
  const shown: Array<{ title: string; body?: string }> = [];
  function FakeNotification(this: unknown, title: string, options?: { body?: string }) {
    shown.push(options?.body === undefined ? { title } : { title, body: options.body });
  }
  FakeNotification.permission = permission;
  FakeNotification.requestPermission = vi.fn(async () => permission);
  return { FakeNotification, shown };
}

/** Stub every browser global the five web providers touch (Notification, navigator.clipboard, location). */
function stubWebGlobals(launchHref = "https://example.test/launch?deeplink=myapp%3A%2F%2Flaunch") {
  const { FakeNotification, shown } = createFakeNotificationCtor("granted");
  vi.stubGlobal("Notification", FakeNotification);
  vi.stubGlobal("navigator", {
    clipboard: {
      readText: vi.fn(async () => "clipboard text"),
      writeText: vi.fn(async () => undefined)
    }
  });
  vi.stubGlobal("location", { href: launchHref });
  return { shownNotifications: shown };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("framework: core lifecycle across all capabilities (integration)", () => {
  describe("boot with all five capability plugins", () => {
    it("start → every capability API is present and callable → stop resolves cleanly", async () => {
      const { shownNotifications } = stubWebGlobals();
      const app = buildFullApp({
        runtime: { forceKind: "web" },
        store: { name: "boot-all-five-db" }
      });
      await app.start();

      expect(app.store).toBeDefined();
      expect(app.notify).toBeDefined();
      expect(app.clipboard).toBeDefined();
      expect(app.tray).toBeDefined();
      expect(app.deepLink).toBeDefined();

      expect(await app.store.set("boot", "ok")).toEqual({
        ok: true,
        value: undefined,
        provider: "web"
      });
      expect(await app.store.get<string>("boot")).toEqual({
        ok: true,
        value: "ok",
        provider: "web"
      });

      expect(await app.notify.show({ title: "Booted" })).toEqual({
        ok: true,
        value: undefined,
        provider: "web"
      });
      expect(shownNotifications).toEqual([{ title: "Booted" }]);

      expect(await app.clipboard.writeText("copied")).toEqual({
        ok: true,
        value: undefined,
        provider: "web"
      });
      expect(await app.clipboard.readText()).toEqual({
        ok: true,
        value: "clipboard text",
        provider: "web"
      });

      // Tray has no web implementation — callable, but a typed "unsupported" result.
      expect(await app.tray.setTooltip("hover")).toEqual({
        ok: false,
        provider: "web",
        reason: "unsupported"
      });

      expect(await app.deepLink.getCurrent()).toEqual({
        ok: true,
        value: "myapp://launch",
        provider: "web"
      });

      await expect(app.stop()).resolves.toBeUndefined();
    });
  });

  describe("zero-plugin app", () => {
    it("createApp({ plugins: [] }) boots, starts, and stops", async () => {
      const app = createApp({ plugins: [] });

      await expect(app.start()).resolves.toBeUndefined();
      await expect(app.stop()).resolves.toBeUndefined();
    });
  });

  describe("config composition", () => {
    it("store.name overrides the default: two apps get distinct IndexedDB namespaces", async () => {
      const alpha = createApp({
        plugins: [storePlugin],
        pluginConfigs: { store: { name: "compose-ns-alpha" } }
      });
      const beta = createApp({
        plugins: [storePlugin],
        pluginConfigs: { store: { name: "compose-ns-beta" } }
      });
      await alpha.start();
      await beta.start();

      expect(await alpha.store.set("shared-key", "alpha-value")).toEqual({
        ok: true,
        value: undefined,
        provider: "web"
      });

      // The same key read through the other namespace is absent — the name override
      // really selected a different IndexedDB database.
      expect(await beta.store.get<string>("shared-key")).toEqual({
        ok: true,
        value: undefined,
        provider: "web"
      });
      expect(await beta.store.keys()).toEqual({ ok: true, value: [], provider: "web" });
      expect(await alpha.store.get<string>("shared-key")).toEqual({
        ok: true,
        value: "alpha-value",
        provider: "web"
      });

      await alpha.stop();
      await beta.stop();
    });

    it("deepLink.schemes filter applies: a non-matching launch URL is filtered to null", async () => {
      // The page hands the app a deep link explicitly; its scheme is not in the allowlist.
      vi.stubGlobal("location", {
        href: "https://example.test/landing?deeplink=other%3A%2F%2Flaunch%3Fx%3D1"
      });

      // Control app (no schemes filter) sees the deep link the page carried...
      const unfiltered = createApp({ plugins: [deepLinkPlugin] });
      await unfiltered.start();
      expect(await unfiltered.deepLink.getCurrent()).toEqual({
        ok: true,
        value: "other://launch?x=1",
        provider: "web"
      });
      await unfiltered.stop();

      // ...while the schemes-configured app filters it out.
      const filtered = createApp({
        plugins: [deepLinkPlugin],
        pluginConfigs: { deepLink: { schemes: ["myapp"] } }
      });
      await filtered.start();
      const filteredResult = await filtered.deepLink.getCurrent();
      // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — null is the documented "filtered" value
      expect(filteredResult).toEqual({ ok: true, value: null, provider: "web" });
      await filtered.stop();
    });

    it("tray.id override is accepted through onInit and the app still lifecycles", async () => {
      const app = buildFullApp({
        runtime: { forceKind: "web" },
        store: { name: "compose-tray-id-db" },
        tray: { id: "custom-tray-id" }
      });
      await app.start();

      expect(app.tray).toBeDefined();
      expect(await app.tray.setMenu([{ id: "quit", text: "Quit" }])).toEqual({
        ok: false,
        provider: "web",
        reason: "unsupported"
      });

      await app.stop();
    });

    it("runtime force overrides flow through the coreConfig-level createCore bootstrap", async () => {
      const runtimeProbePlugin = coreConfig.createPlugin("runtimeProbe", {
        api: ctx => ({
          snapshot: (): { kind: string; platform: string } => ({
            kind: ctx.runtime.kind,
            platform: ctx.runtime.platform
          })
        })
      });
      const framework = coreConfig.createCore(coreConfig, {
        plugins: [runtimeProbePlugin],
        // forcePlatform "windows" cannot come from auto-detection on this host —
        // observing it proves the override (not detection) drove ctx.runtime.
        pluginConfigs: { runtime: { forceKind: "web", forcePlatform: "windows" } }
      });
      const app = framework.createApp();
      await app.start();

      expect(app.runtimeProbe.snapshot()).toEqual({ kind: "web", platform: "windows" });

      await app.stop();
    });
  });

  describe("API calls before app.start()", () => {
    it("every capability method resolves to a typed 'unavailable' failure", async () => {
      const app = buildFullApp({
        runtime: { forceKind: "web" },
        store: { name: "before-start-full-db" }
      });

      const notStarted = {
        ok: false,
        provider: "web",
        reason: "unavailable",
        message: "app not started — call app.start() first"
      };

      // Every async capability method across all five plugins. deepLink.onOpen is the
      // one exception: it is a local, synchronous subscription, not a SystemResult method.
      const calls: Array<[string, () => Promise<unknown>]> = [
        ["store.get", () => app.store.get("k")],
        ["store.set", () => app.store.set("k", 1)],
        ["store.delete", () => app.store.delete("k")],
        ["store.keys", () => app.store.keys()],
        ["store.clear", () => app.store.clear()],
        ["notify.isPermissionGranted", () => app.notify.isPermissionGranted()],
        ["notify.requestPermission", () => app.notify.requestPermission()],
        ["notify.show", () => app.notify.show({ title: "t" })],
        ["clipboard.readText", () => app.clipboard.readText()],
        ["clipboard.writeText", () => app.clipboard.writeText("t")],
        ["tray.setMenu", () => app.tray.setMenu([{ id: "a", text: "A" }])],
        ["tray.setTooltip", () => app.tray.setTooltip("t")],
        ["tray.setIcon", () => app.tray.setIcon("/icon.png")],
        ["tray.destroy", () => app.tray.destroy()],
        ["deepLink.getCurrent", () => app.deepLink.getCurrent()]
      ];

      for (const [name, invoke] of calls) {
        await expect(invoke(), `${name} before start`).resolves.toEqual(notStarted);
      }
    });
  });

  describe("teardown", () => {
    it("stop() resolves after exercising APIs; post-stop calls behave deterministically", async () => {
      stubWebGlobals();
      const app = buildFullApp({
        runtime: { forceKind: "web" },
        store: { name: "teardown-db" }
      });
      await app.start();

      expect(await app.store.set("teardown-key", "written")).toEqual({
        ok: true,
        value: undefined,
        provider: "web"
      });
      expect(await app.clipboard.writeText("bye")).toEqual({
        ok: true,
        value: undefined,
        provider: "web"
      });

      await expect(app.stop()).resolves.toBeUndefined();

      // Seam contract (src/plugins/runtime/provider.ts): stopResolution flips the
      // teardown entry and awaits the resolved provider's dispose(), but never resets
      // ctx.state.provider — the SETTLED resolution promise remains in the slot. A
      // post-stop call on a cleanly-stopped app therefore deterministically routes to
      // the already-resolved (no-op-disposed) web provider and succeeds; the
      // "stopped during resolution" failure only exists for loads still in flight at
      // stop() time (covered in edge-cases.test.ts).
      const postStopGet = await app.store.get<string>("teardown-key");
      expect(postStopGet).toEqual({ ok: true, value: "written", provider: "web" });

      // Deterministic: a repeat call observes the identical settled outcome.
      expect(await app.store.get<string>("teardown-key")).toEqual(postStopGet);

      // The unsupported-by-kind capability stays typed-unsupported after stop.
      expect(await app.tray.destroy()).toEqual({
        ok: false,
        provider: "web",
        reason: "unsupported"
      });
    });
  });
});
