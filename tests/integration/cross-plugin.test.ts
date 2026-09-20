import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// force-testing rule (runtime README): forcing kind "tauri" MUST be paired with
// vi.mock of the real Tauri modules so provider construction never reaches a real
// IPC call. All five capabilities' packages (six modules) are mocked once for the
// whole file — web-forced scenarios never touch them (the imports are lazy).
const {
  mockStoreLoad,
  fakeTrayIcon,
  mockTrayIconNew,
  mockMenuNew,
  mockIsPermissionGranted,
  mockRequestPermission,
  mockSendNotification,
  mockClipboardReadText,
  mockClipboardWriteText,
  mockDeepLinkGetCurrent,
  mockOnOpenUrl,
  mockUnlisten,
  deepLinkHandlers,
  mockDefaultWindowIcon
} = vi.hoisted(() => {
  const mockStoreLoad = vi.fn(async (_path: string, _options?: unknown) => {
    const data = new Map<string, unknown>();
    return {
      get: async <T>(key: string): Promise<T | undefined> => data.get(key) as T | undefined,
      set: async (key: string, value: unknown): Promise<void> => {
        data.set(key, value);
      },
      delete: async (key: string): Promise<boolean> => data.delete(key),
      keys: async (): Promise<string[]> => [...data.keys()],
      clear: async (): Promise<void> => {
        data.clear();
      },
      save: async (): Promise<void> => undefined,
      close: async (): Promise<void> => undefined
    };
  });

  const fakeTrayIcon = {
    setIcon: vi.fn(async () => undefined),
    setMenu: vi.fn(async () => undefined),
    setTooltip: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined)
  };
  const mockTrayIconNew = vi.fn(async () => fakeTrayIcon);
  const mockMenuNew = vi.fn(async () => ({ close: vi.fn(async () => undefined) }));
  // The status item is created with the app's default window icon unless tray.icon is set.
  const mockDefaultWindowIcon = vi.fn(async () => ({ rid: 1 }));

  const mockIsPermissionGranted = vi.fn(async () => true);
  const mockRequestPermission = vi.fn(async () => "granted" as const);
  const mockSendNotification = vi.fn();

  const mockClipboardReadText = vi.fn(async () => "native clipboard text");
  const mockClipboardWriteText = vi.fn(async () => undefined);

  const mockUnlisten = vi.fn();
  const deepLinkHandlers: Array<(urls: string[]) => void> = [];
  const mockOnOpenUrl = vi.fn(async (handler: (urls: string[]) => void) => {
    deepLinkHandlers.push(handler);
    return mockUnlisten;
  });
  // eslint-disable-next-line unicorn/no-null -- default mock: the Tauri plugin reports no launch URLs
  const mockDeepLinkGetCurrent = vi.fn(async () => null as string[] | null);

  return {
    mockStoreLoad,
    fakeTrayIcon,
    mockTrayIconNew,
    mockMenuNew,
    mockIsPermissionGranted,
    mockRequestPermission,
    mockSendNotification,
    mockClipboardReadText,
    mockClipboardWriteText,
    mockDeepLinkGetCurrent,
    mockOnOpenUrl,
    mockUnlisten,
    deepLinkHandlers,
    mockDefaultWindowIcon
  };
});

vi.mock("@tauri-apps/plugin-store", () => ({ load: mockStoreLoad }));
vi.mock("@tauri-apps/api/tray", () => ({ TrayIcon: { new: mockTrayIconNew } }));
vi.mock("@tauri-apps/api/menu", () => ({ Menu: { new: mockMenuNew } }));
vi.mock("@tauri-apps/api/app", () => ({ defaultWindowIcon: mockDefaultWindowIcon }));
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: mockIsPermissionGranted,
  requestPermission: mockRequestPermission,
  sendNotification: mockSendNotification
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: mockClipboardReadText,
  writeText: mockClipboardWriteText
}));
vi.mock("@tauri-apps/plugin-deep-link", () => ({
  getCurrent: mockDeepLinkGetCurrent,
  onOpenUrl: mockOnOpenUrl
}));

import { coreConfig } from "../../src/config";
import type { SystemResult } from "../../src/index";
import { clipboardPlugin } from "../../src/plugins/clipboard";
import { deepLinkPlugin } from "../../src/plugins/deep-link";
import { notifyPlugin } from "../../src/plugins/notify";
import type { RuntimeConfig } from "../../src/plugins/runtime/types";
import { storePlugin } from "../../src/plugins/store";
import { trayPlugin } from "../../src/plugins/tray";

type SystemOverrides = {
  runtime?: Partial<RuntimeConfig>;
  store?: { name?: string };
};

/**
 * Framework-internal integration bootstrap (house style: framework `__tests__` may
 * import/reuse `coreConfig` directly). Composes ALL FIVE capability plugins into one
 * app, forcing `ctx.runtime` via the loosely-typed `createCore`-level `pluginConfigs`
 * (core-plugin overrides are only reachable at the createCoreConfig/createCore level,
 * never from createApp — see runtime/README.md).
 */
function buildSystemApp(overrides: SystemOverrides) {
  const framework = coreConfig.createCore(coreConfig, {
    plugins: [storePlugin, notifyPlugin, clipboardPlugin, trayPlugin, deepLinkPlugin],
    pluginConfigs: overrides
  });
  return framework.createApp();
}

/** Stub the browser Notification global the notify web provider reads structurally. */
function stubWebNotification(permission: "default" | "denied" | "granted" = "granted") {
  const instances: Array<{ title: string }> = [];
  function FakeNotification(this: unknown, title: string, _options?: { body?: string }) {
    instances.push({ title });
  }
  FakeNotification.permission = permission;
  FakeNotification.requestPermission = vi.fn(async () => permission);
  vi.stubGlobal("Notification", FakeNotification);
  return { FakeNotification, instances };
}

/**
 * Stub the webview `window.Notification` the Tauri plugin's `sendNotification`
 * constructs — the shell path needs it exactly as the web path needs the bare global.
 */
function stubShellNotification() {
  const instances: Array<{ title: string }> = [];
  function FakeNotification(this: unknown, title: string, _options?: { body?: string }) {
    instances.push({ title });
  }
  vi.stubGlobal("window", { Notification: FakeNotification });
  return { instances };
}

/** Stub navigator.clipboard the clipboard web provider reads structurally. */
function stubWebClipboard(text = "web clipboard text") {
  const readText = vi.fn(async () => text);
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { clipboard: { readText, writeText } });
  return { readText, writeText };
}

/** Stub the location global the deep-link web provider captures at construction. */
function stubWebLocation(href: string) {
  vi.stubGlobal("location", { href });
}

/** Flush the event bus's sequential async dispatch (one macrotask covers all handlers). */
function flushDispatch(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  deepLinkHandlers.length = 0;
  // Both shells run inside a webview: notify's Tauri path constructs
  // `new window.Notification(...)`, so the global belongs in every scenario.
  stubShellNotification();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("framework: cross-plugin composition (integration)", () => {
  describe("scenario 1 — all-web composition", () => {
    it("one app carries all five capabilities on their web providers", async () => {
      stubWebNotification("granted");
      const clipboard = stubWebClipboard("hello from web clipboard");
      stubWebLocation("https://example.test/landing?ref=cross");

      const app = buildSystemApp({
        runtime: { forceKind: "web" },
        store: { name: "cross-all-web-db" }
      });
      await app.start();

      // store — real IndexedDB round-trip via fake-indexeddb
      expect(await app.store.set("count", 41)).toEqual({
        ok: true,
        value: undefined,
        provider: "web"
      });
      expect(await app.store.get<number>("count")).toEqual({
        ok: true,
        value: 41,
        provider: "web"
      });

      // notify — permission flow over the stubbed Notification global
      expect(await app.notify.isPermissionGranted()).toEqual({
        ok: true,
        value: true,
        provider: "web"
      });
      expect(await app.notify.requestPermission()).toEqual({
        ok: true,
        value: true,
        provider: "web"
      });
      expect(await app.notify.show({ title: "Sync complete" })).toEqual({
        ok: true,
        value: undefined,
        provider: "web"
      });

      // clipboard — read/write over the stubbed navigator.clipboard
      expect(await app.clipboard.writeText("share this")).toEqual({
        ok: true,
        value: undefined,
        provider: "web"
      });
      expect(clipboard.writeText).toHaveBeenCalledWith("share this");
      expect(await app.clipboard.readText()).toEqual({
        ok: true,
        value: "hello from web clipboard",
        provider: "web"
      });

      // deepLink — getCurrent reflects the launch URL captured from the stubbed location
      expect(await app.deepLink.getCurrent()).toEqual({
        ok: true,
        value: "https://example.test/landing?ref=cross",
        provider: "web"
      });

      // tray — unsupported-by-kind: EVERY method reports the typed absence
      expect(await app.tray.setMenu([{ id: "quit", text: "Quit" }])).toEqual({
        ok: false,
        provider: "web",
        reason: "unsupported"
      });
      expect(await app.tray.setTooltip("hi")).toEqual({
        ok: false,
        provider: "web",
        reason: "unsupported"
      });
      expect(await app.tray.setIcon("/icon.png")).toEqual({
        ok: false,
        provider: "web",
        reason: "unsupported"
      });
      expect(await app.tray.destroy()).toEqual({
        ok: false,
        provider: "web",
        reason: "unsupported"
      });

      await app.stop();
    });
  });

  describe("scenario 2 — all-tauri composition", () => {
    it("every capability resolves its tauri provider and every result carries provider 'tauri'", async () => {
      const app = buildSystemApp({
        runtime: { forceKind: "tauri", forcePlatform: "macos" }
      });
      await app.start();

      const results: Array<SystemResult<unknown>> = [
        await app.store.set("greeting", "hello"),
        await app.store.get<string>("greeting"),
        await app.notify.isPermissionGranted(),
        await app.notify.show({ title: "Done" }),
        await app.clipboard.writeText("native copy"),
        await app.clipboard.readText(),
        await app.tray.setMenu([{ id: "quit", text: "Quit" }]),
        await app.deepLink.getCurrent()
      ];

      for (const result of results) {
        expect(result.ok).toBe(true);
        expect(result.provider).toBe("tauri");
      }

      // Spot-check the values actually flowed through the mocked native modules.
      expect(await app.store.get<string>("greeting")).toEqual({
        ok: true,
        value: "hello",
        provider: "tauri"
      });
      expect(mockSendNotification).toHaveBeenCalledWith({ title: "Done" });
      expect(mockClipboardWriteText).toHaveBeenCalledWith("native copy");
      expect(mockTrayIconNew).toHaveBeenCalledTimes(1);
      expect(mockOnOpenUrl).toHaveBeenCalledTimes(1);

      await app.stop();
    });
  });

  describe("scenario 3 — teardown fan-out", () => {
    it("app.stop() disposes every capability: tray icon closed, deepLink listener unregistered", async () => {
      const app = buildSystemApp({
        runtime: { forceKind: "tauri", forcePlatform: "macos" }
      });
      await app.start();

      // One call per capability so every provider (and the tray's lazy OS icon)
      // actually exists before teardown; awaiting them also guarantees the
      // fire-and-forget resolutions have settled.
      await app.store.set("k", 1);
      await app.notify.show({ title: "t" });
      await app.clipboard.writeText("w");
      await app.tray.setMenu([{ id: "quit", text: "Quit" }]);
      await app.deepLink.getCurrent();

      expect(fakeTrayIcon.close).not.toHaveBeenCalled();
      expect(mockUnlisten).not.toHaveBeenCalled();

      await app.stop();

      expect(fakeTrayIcon.close).toHaveBeenCalledTimes(1);
      expect(mockUnlisten).toHaveBeenCalledTimes(1);
    });
  });

  describe("scenario 4 — multi-instance isolation (D-009)", () => {
    it("two simultaneous apps stay independent; stopping one leaves the other intact", async () => {
      stubWebNotification("granted");
      stubWebClipboard();
      stubWebLocation("https://example.test/");

      const webApp = buildSystemApp({
        runtime: { forceKind: "web" },
        store: { name: "cross-isolation-web-db" }
      });
      const tauriApp = buildSystemApp({
        runtime: { forceKind: "tauri", forcePlatform: "macos" }
      });
      await webApp.start();
      await tauriApp.start();

      // Independent results for the same key — separate providers, separate storage.
      expect(await webApp.store.set("origin", "web")).toEqual({
        ok: true,
        value: undefined,
        provider: "web"
      });
      expect(await tauriApp.store.set("origin", "tauri")).toEqual({
        ok: true,
        value: undefined,
        provider: "tauri"
      });
      expect(await webApp.store.get<string>("origin")).toEqual({
        ok: true,
        value: "web",
        provider: "web"
      });
      expect(await tauriApp.store.get<string>("origin")).toEqual({
        ok: true,
        value: "tauri",
        provider: "tauri"
      });

      // Materialize tauriApp's OS artifacts so a wrong-registry teardown would be visible.
      await tauriApp.tray.setMenu([{ id: "quit", text: "Quit" }]);
      await tauriApp.deepLink.getCurrent();

      await webApp.stop();

      // The WeakMap-per-frozen-global teardown registry (D-009) scoped the stop to
      // webApp: tauriApp's OS artifacts survive and its APIs keep working.
      expect(fakeTrayIcon.close).not.toHaveBeenCalled();
      expect(mockUnlisten).not.toHaveBeenCalled();
      expect(await tauriApp.store.get<string>("origin")).toEqual({
        ok: true,
        value: "tauri",
        provider: "tauri"
      });
      expect(await tauriApp.clipboard.writeText("still alive")).toEqual({
        ok: true,
        value: undefined,
        provider: "tauri"
      });
      expect(await tauriApp.tray.setTooltip("still alive")).toEqual({
        ok: true,
        value: undefined,
        provider: "tauri"
      });

      await tauriApp.stop();

      expect(fakeTrayIcon.close).toHaveBeenCalledTimes(1);
      expect(mockUnlisten).toHaveBeenCalledTimes(1);
    });
  });

  describe("scenario 5 — per-capability failure isolation", () => {
    it("an absent Notification global degrades ONLY notify; the other capabilities still succeed", async () => {
      // No stubWebNotification here — Node has no Notification global, so the notify
      // web provider resolves to the all-unsupported stand-in while its siblings load fine.
      stubWebClipboard("isolated clipboard");
      stubWebLocation("https://example.test/isolated");

      const app = buildSystemApp({
        runtime: { forceKind: "web" },
        store: { name: "cross-failure-isolation-db" }
      });
      await app.start();

      expect(await app.notify.show({ title: "t" })).toEqual({
        ok: false,
        provider: "web",
        reason: "unsupported"
      });
      expect(await app.notify.isPermissionGranted()).toEqual({
        ok: false,
        provider: "web",
        reason: "unsupported"
      });

      expect(await app.store.set("still", "works")).toEqual({
        ok: true,
        value: undefined,
        provider: "web"
      });
      expect(await app.clipboard.readText()).toEqual({
        ok: true,
        value: "isolated clipboard",
        provider: "web"
      });
      expect(await app.deepLink.getCurrent()).toEqual({
        ok: true,
        value: "https://example.test/isolated",
        provider: "web"
      });

      await app.stop();
    });
  });

  describe("scenario 6 — deepLink:open visibility in a full composition", () => {
    it("a depends probe observes the event; the runtime bus is name-keyed, so a non-depends hook is invoked too (depends-gating is the compile-time visibility contract)", async () => {
      const observed: Array<{ url: string }> = [];
      let untypedDeliveries = 0;

      const dependentProbe = coreConfig.createPlugin("deepLinkDependentProbe", {
        depends: [deepLinkPlugin],
        hooks: () => ({
          "deepLink:open": (payload: { url: string }) => {
            observed.push(payload);
          }
        })
      });
      // No depends edge: the typed payload is invisible to this plugin (spec/07 §2/§5 is
      // a type-level contract — see the deep-link integration test), but the kernel's
      // event bus registers hooks by NAME, so the handler still runs at dispatch time.
      const independentProbe = coreConfig.createPlugin("deepLinkIndependentProbe", {
        hooks: () => ({
          "deepLink:open": () => {
            untypedDeliveries += 1;
          }
        })
      });

      const framework = coreConfig.createCore(coreConfig, {
        plugins: [
          storePlugin,
          notifyPlugin,
          clipboardPlugin,
          trayPlugin,
          deepLinkPlugin,
          dependentProbe,
          independentProbe
        ],
        pluginConfigs: { runtime: { forceKind: "tauri", forcePlatform: "macos" } }
      });
      const app = framework.createApp();
      await app.start();
      // Awaiting a resolved-provider API call guarantees the fire-and-forget
      // resolution (including onOpenUrl registration) has settled.
      await app.deepLink.getCurrent();

      const handler = deepLinkHandlers.at(-1);
      expect(handler).toBeDefined();
      handler?.(["myapp://cross-plugin"]);
      await flushDispatch();

      expect(observed).toEqual([{ url: "myapp://cross-plugin" }]);
      expect(untypedDeliveries).toBe(1);

      await app.stop();
    });
  });

  describe("scenario 7 — immediate-call burst after start()", () => {
    it("synchronous calls on every capability all resolve valid results via in-flight resolution", async () => {
      const app = buildSystemApp({
        runtime: { forceKind: "tauri", forcePlatform: "macos" }
      });
      await app.start();

      // No awaits between the calls: every provider resolution is still in flight,
      // so each API method bridges it through awaitProvider instead of failing.
      const burst = [
        app.store.set("burst", true),
        app.notify.isPermissionGranted(),
        app.clipboard.readText(),
        app.tray.setTooltip("burst"),
        app.deepLink.getCurrent()
      ] as const;
      const results: Array<SystemResult<unknown>> = await Promise.all(burst);

      for (const result of results) {
        expect(result.ok).toBe(true);
        expect(result.provider).toBe("tauri");
      }

      await app.stop();
    });
  });

  describe("scenario 8 — provider-field consistency", () => {
    it("forceKind 'web': every capability's result reports provider 'web' (including tray's unsupported)", async () => {
      stubWebNotification("granted");
      stubWebClipboard();
      stubWebLocation("https://example.test/consistency");

      const app = buildSystemApp({
        runtime: { forceKind: "web" },
        store: { name: "cross-provider-web-db" }
      });
      await app.start();

      const results: Array<SystemResult<unknown>> = [
        await app.store.set("k", 1),
        await app.store.get<number>("k"),
        await app.notify.isPermissionGranted(),
        await app.notify.show({ title: "t" }),
        await app.clipboard.writeText("w"),
        await app.clipboard.readText(),
        await app.tray.setMenu([{ id: "quit", text: "Quit" }]),
        await app.deepLink.getCurrent()
      ];

      for (const result of results) {
        expect(result.provider).toBe("web");
      }

      await app.stop();
    });

    it("forceKind 'tauri' + forcePlatform 'ios': tray reports provider 'tauri' with reason 'unsupported'; siblings succeed as 'tauri'", async () => {
      const app = buildSystemApp({
        runtime: { forceKind: "tauri", forcePlatform: "ios" }
      });
      await app.start();

      // Platform-gated-within-kind: the failure still names the ACTIVE kind.
      expect(await app.tray.setMenu([{ id: "quit", text: "Quit" }])).toEqual({
        ok: false,
        provider: "tauri",
        reason: "unsupported"
      });
      expect(mockTrayIconNew).not.toHaveBeenCalled();

      const results: Array<SystemResult<unknown>> = [
        await app.store.set("k", 1),
        await app.notify.isPermissionGranted(),
        await app.clipboard.readText(),
        await app.deepLink.getCurrent(),
        await app.tray.setTooltip("t")
      ];

      for (const result of results) {
        expect(result.provider).toBe("tauri");
      }

      await app.stop();
    });
  });
});
