import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// force-testing rule (runtime README): forcing kind "tauri" MUST be paired with
// vi.mock of the real Tauri modules so provider construction never reaches a real
// IPC call. Both mocks support an optional per-test gate so tests can hold provider
// resolution in flight (the slow-fake pattern from store-stop-during-resolution.test.ts).
const tauriMocks = vi.hoisted(() => {
  let gate: Promise<void> | undefined;
  let handler: ((urls: string[]) => void) | undefined;

  const mockUnlisten = vi.fn();
  const mockOnOpenUrl = vi.fn(async (h: (urls: string[]) => void) => {
    if (gate !== undefined) {
      await gate;
    }
    handler = h;
    return mockUnlisten;
  });
  // eslint-disable-next-line unicorn/no-null -- default mock: the Tauri plugin reports no launch URLs
  const mockGetCurrent = vi.fn(async () => null as string[] | null);

  const fakeTauriStore = {
    get: vi.fn(async () => undefined),
    set: vi.fn(async () => undefined),
    delete: vi.fn(async () => true),
    keys: vi.fn(async () => [] as string[]),
    clear: vi.fn(async () => undefined),
    save: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined)
  };
  const mockStoreLoad = vi.fn(async () => {
    if (gate !== undefined) {
      await gate;
    }
    return fakeTauriStore;
  });

  return {
    mockUnlisten,
    mockOnOpenUrl,
    mockGetCurrent,
    mockStoreLoad,
    getHandler: () => handler,
    setGate: (g: Promise<void>): void => {
      gate = g;
    },
    reset: (): void => {
      gate = undefined;
      handler = undefined;
    }
  };
});

vi.mock("@tauri-apps/plugin-deep-link", () => ({
  getCurrent: tauriMocks.mockGetCurrent,
  onOpenUrl: tauriMocks.mockOnOpenUrl
}));
vi.mock("@tauri-apps/plugin-store", () => ({ load: tauriMocks.mockStoreLoad }));

import { coreConfig } from "../../src/config";
import { createApp } from "../../src/index";
import { clipboardPlugin } from "../../src/plugins/clipboard";
import { deepLinkPlugin } from "../../src/plugins/deep-link";
import { notifyPlugin } from "../../src/plugins/notify";
import { storePlugin } from "../../src/plugins/store";

beforeEach(() => {
  tauriMocks.reset();
  tauriMocks.mockUnlisten.mockClear();
  tauriMocks.mockOnOpenUrl.mockClear();
  tauriMocks.mockGetCurrent.mockClear();
  // eslint-disable-next-line unicorn/no-null -- default mock: the Tauri plugin reports no launch URLs
  tauriMocks.mockGetCurrent.mockImplementation(async () => null);
  tauriMocks.mockStoreLoad.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Factory whose onInit must reject: store.name is empty. */
const buildEmptyStoreNameApp = () =>
  createApp({
    plugins: [storePlugin],
    pluginConfigs: { store: { name: "" } }
  });

/** Factory whose onInit must reject: a schemes entry is not a lowercase URI scheme. */
const buildBadSchemeApp = () =>
  createApp({
    plugins: [deepLinkPlugin],
    pluginConfigs: { deepLink: { schemes: ["Bad Scheme!"] } }
  });

describe("framework: edge cases (integration)", () => {
  describe("invalid config is rejected at createApp() (the kernel runs onInit synchronously)", () => {
    it("store { name: '' } throws a TypeError with the kernel message format", () => {
      expect(buildEmptyStoreNameApp).toThrow(TypeError);
      expect(buildEmptyStoreNameApp).toThrow("[system] store.name must be a file-safe namespace");
    });

    it("deepLink { schemes: ['Bad Scheme!'] } throws a TypeError naming the offending entry", () => {
      expect(buildBadSchemeApp).toThrow(TypeError);
      expect(buildBadSchemeApp).toThrow('Fix "Bad Scheme!" in pluginConfigs.');
    });
  });

  describe("stop() during in-flight resolution across multiple capabilities", () => {
    it("disposes every provider before stop() resolves, and stop() never throws", async () => {
      // Released a macrotask after stop() is called: by then teardown has run as far as
      // it can and is parked on this gate, whatever the kernel's internal await count.
      let release!: () => void;
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      tauriMocks.setGate(gate);

      const framework = coreConfig.createCore(coreConfig, {
        plugins: [storePlugin, deepLinkPlugin],
        pluginConfigs: { runtime: { forceKind: "tauri" }, store: { name: "stalled-multi" } }
      });
      const app = framework.createApp();

      // onStart fires both startResolution calls fire-and-forget; both provider loads
      // are now stalled on the shared gate, so start() resolves immediately.
      await app.start();

      // Teardown runs in reverse plugin order, so deepLink stops first and parks on its
      // in-flight resolution; store's load settles during that wait, so its provider is
      // installed and then disposed by store's own onStop. Either way every provider is
      // disposed before stop() resolves — and stop() must not throw.
      const stopping = app.stop();
      setTimeout(release, 0);
      await expect(stopping).resolves.toBeUndefined();

      // deepLink was stopped mid-resolution: "stopped during resolution" is produced ONLY
      // on the path that has already awaited provider.dispose() (runtime/provider.ts).
      const stoppedDuringResolution = {
        ok: false,
        provider: "tauri",
        reason: "unavailable",
        message: "stopped during resolution"
      };
      expect(await app.deepLink.getCurrent()).toEqual(stoppedDuringResolution);

      // The deep-link provider's dispose is observable, and it happened before stop()
      // resolved — the listener is already gone by the time the assertions run.
      expect(tauriMocks.mockUnlisten).toHaveBeenCalledTimes(1);

      // store's load settles during that same teardown window; whichever side of its own
      // sentinel it lands on, its resolution is final once stop() resolved — repeat calls
      // observe the identical outcome instead of re-entering resolution.
      const firstStoreResult = await app.store.get("k");
      expect(await app.store.get("k")).toEqual(firstStoreResult);
    });
  });

  describe("deepLink delivery pipeline under stress", () => {
    it("rapid deliveries with repeats and filtered schemes reach subscribers filtered, in order", async () => {
      const framework = coreConfig.createCore(coreConfig, {
        plugins: [deepLinkPlugin],
        pluginConfigs: { runtime: { forceKind: "tauri" }, deepLink: { schemes: ["myapp"] } }
      });
      const app = framework.createApp();
      await app.start();
      // Resolution (including onOpenUrl registration) is fire-and-forget from onStart;
      // awaiting a resolved-provider API call guarantees the handler is registered.
      await app.deepLink.getCurrent();

      const first: string[] = [];
      const second: string[] = [];
      app.deepLink.onOpen(({ url }) => first.push(url));
      app.deepLink.onOpen(({ url }) => second.push(url));

      const handler = tauriMocks.getHandler();
      expect(handler).toBeDefined();

      // Rapid burst: a batch with an internal repeat, a filtered scheme, another
      // repeat, a new URL, then the first URL again. No launch URL was reported, so
      // nothing is a replay — every allowed delivery reaches the subscribers in order.
      handler?.(["myapp://one", "myapp://one"]);
      handler?.(["other://intruder"]);
      handler?.(["myapp://one"]);
      handler?.(["myapp://two"]);
      handler?.(["myapp://one"]);

      const expected = ["myapp://one", "myapp://one", "myapp://one", "myapp://two", "myapp://one"];
      expect(first).toEqual(expected);
      expect(second).toEqual(expected);

      await app.stop();
    });
  });

  describe("mixed capability availability in one app", () => {
    it("notify is typed-unsupported (no Notification global) while store and clipboard succeed", async () => {
      // No Notification global exists under Node — notify's web provider degrades to
      // the all-unsupported stand-in. Clipboard gets a working navigator.clipboard.
      vi.stubGlobal("navigator", {
        clipboard: {
          readText: vi.fn(async () => "still works"),
          writeText: vi.fn(async () => undefined)
        }
      });

      const framework = coreConfig.createCore(coreConfig, {
        plugins: [notifyPlugin, storePlugin, clipboardPlugin],
        pluginConfigs: { runtime: { forceKind: "web" }, store: { name: "mixed-availability-db" } }
      });
      const app = framework.createApp();
      await app.start();

      const unsupported = { ok: false, provider: "web", reason: "unsupported" };
      expect(await app.notify.show({ title: "nope" })).toEqual(unsupported);
      expect(await app.notify.isPermissionGranted()).toEqual(unsupported);
      expect(await app.notify.requestPermission()).toEqual(unsupported);

      // No cross-contamination: the sibling capabilities resolve their own providers
      // and succeed with fully-typed ok results.
      expect(await app.store.set("k", 42)).toEqual({ ok: true, value: undefined, provider: "web" });
      expect(await app.store.get<number>("k")).toEqual({ ok: true, value: 42, provider: "web" });
      expect(await app.clipboard.writeText("hi")).toEqual({
        ok: true,
        value: undefined,
        provider: "web"
      });
      expect(await app.clipboard.readText()).toEqual({
        ok: true,
        value: "still works",
        provider: "web"
      });

      await app.stop();
    });
  });
});
