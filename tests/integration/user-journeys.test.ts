/**
 * Framework-level integration: five realistic consumer journeys composing the real
 * framework (createApp / coreConfig.createCore) with multiple capability plugins at
 * once — the cross-plugin scenarios no single plugin's colocated suite covers.
 */
import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// force-testing rule (runtime README): forcing kind "tauri" MUST be paired with
// vi.mock of the real Tauri modules so provider construction never reaches a real
// IPC call. Only the "Desktop app boot" journey forces "tauri"; every other journey
// auto-detects "web" and never touches these mocks.
const {
  fakeTrayIcon,
  mockTrayIconNew,
  mockMenuNew,
  mockDeepLinkGetCurrent,
  mockOnOpenUrl,
  mockUnlisten,
  mockStoreLoad,
  tauriStoreData
} = vi.hoisted(() => {
  const fakeTrayIcon = {
    setIcon: vi.fn(async () => undefined),
    setMenu: vi.fn(async () => undefined),
    setTooltip: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined)
  };
  const mockTrayIconNew = vi.fn(async () => fakeTrayIcon);

  // Local structural mirror of @tauri-apps/api/menu's MenuItemOptions — captures the
  // wired click handlers so the journey can "click" a tray item.
  type NativeMenuItemOptions = {
    id: string;
    text: string;
    enabled?: boolean;
    action?: (id: string) => void;
  };
  const mockMenuNew = vi.fn(async (options: { items: NativeMenuItemOptions[] }) => ({ options }));

  const mockUnlisten = vi.fn();
  const mockOnOpenUrl = vi.fn(async (_handler: (urls: string[]) => void) => mockUnlisten);
  const mockDeepLinkGetCurrent = vi.fn(async (): Promise<string[]> => []);

  // In-memory stand-in for the @tauri-apps/plugin-store file — seedable per journey
  // so "a previous run persisted a value" is expressible.
  const tauriStoreData = new Map<string, unknown>();
  const mockStoreLoad = vi.fn(
    async (_file: string, _options: { defaults: Record<string, never>; autoSave: boolean }) => ({
      get: async (key: string) => tauriStoreData.get(key),
      set: async (key: string, value: unknown) => {
        tauriStoreData.set(key, value);
      },
      delete: async (key: string) => tauriStoreData.delete(key),
      keys: async () => [...tauriStoreData.keys()],
      clear: async () => {
        tauriStoreData.clear();
      },
      save: vi.fn(async () => undefined)
    })
  );

  return {
    fakeTrayIcon,
    mockTrayIconNew,
    mockMenuNew,
    mockDeepLinkGetCurrent,
    mockOnOpenUrl,
    mockUnlisten,
    mockStoreLoad,
    tauriStoreData
  };
});

vi.mock("@tauri-apps/api/tray", () => ({ TrayIcon: { new: mockTrayIconNew } }));
vi.mock("@tauri-apps/api/menu", () => ({ Menu: { new: mockMenuNew } }));
vi.mock("@tauri-apps/plugin-deep-link", () => ({
  getCurrent: mockDeepLinkGetCurrent,
  onOpenUrl: mockOnOpenUrl
}));
vi.mock("@tauri-apps/plugin-store", () => ({ load: mockStoreLoad }));

import { coreConfig } from "../../src/config";
import type { SystemResult } from "../../src/index";
import { createApp } from "../../src/index";
import { clipboardPlugin } from "../../src/plugins/clipboard";
import { deepLinkPlugin } from "../../src/plugins/deep-link";
import { notifyPlugin } from "../../src/plugins/notify";
import { storePlugin } from "../../src/plugins/store";
import { trayPlugin } from "../../src/plugins/tray";

type WebNotificationPermission = "default" | "denied" | "granted";

/**
 * A minimal fake matching the structural shape the notify web provider reads off
 * `globalThis.Notification` — with a MUTABLE `permission` so requestPermission can
 * grant mid-journey (the provider re-reads the static on every call).
 */
function createNotificationStub(permission: WebNotificationPermission) {
  const shown: Array<{ title: string; body?: string }> = [];
  function NotificationStub(this: unknown, title: string, options?: { body?: string }) {
    shown.push(options?.body === undefined ? { title } : { title, body: options.body });
  }
  NotificationStub.permission = permission;
  NotificationStub.requestPermission = vi.fn(async (): Promise<WebNotificationPermission> => {
    NotificationStub.permission = "granted";
    return "granted";
  });
  return { NotificationStub, shown };
}

/**
 * Stub `navigator.clipboard` with spyable read/write; returns the spies so journeys
 * can assert exactly what reached the platform clipboard.
 */
function stubWebClipboard(readValue = "") {
  const readText = vi.fn(async () => readValue);
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { clipboard: { readText, writeText } });
  return { readText, writeText };
}

/**
 * Local structural mirror of the IDBOpenDBRequest surface idb-keyval touches —
 * handlers optional because idb-keyval assigns them after `open()` returns.
 */
type FakeOpenRequest = {
  error: DOMException;
  result: undefined;
  onupgradeneeded?: (event: unknown) => void;
  oncomplete?: (event: unknown) => void;
  onsuccess?: (event: unknown) => void;
  onabort?: (event: unknown) => void;
  onerror?: (event: unknown) => void;
};

/**
 * An `indexedDB.open` whose request rejects asynchronously — so idb-keyval's db
 * promise fails and the store web provider's write-probe throws, exactly like
 * Safari private mode denying IndexedDB storage.
 */
function openPrivateModeDatabase(): FakeOpenRequest {
  const request: FakeOpenRequest = {
    error: new DOMException("The user denied permission to access the database.", "UnknownError"),
    result: undefined
  };
  queueMicrotask(() => request.onerror?.({}));
  return request;
}

/** True when a capability reported it simply does not exist on this runtime. */
const isUnsupported = (result: SystemResult<unknown>): boolean =>
  !result.ok && result.reason === "unsupported";

beforeEach(() => {
  mockTrayIconNew.mockClear();
  mockMenuNew.mockClear();
  fakeTrayIcon.setMenu.mockClear();
  fakeTrayIcon.setTooltip.mockClear();
  fakeTrayIcon.setIcon.mockClear();
  fakeTrayIcon.close.mockClear();
  mockOnOpenUrl.mockClear();
  mockUnlisten.mockClear();
  mockDeepLinkGetCurrent.mockReset();
  mockDeepLinkGetCurrent.mockResolvedValue([]);
  mockStoreLoad.mockClear();
  tauriStoreData.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("framework: consumer user journeys (integration)", () => {
  it("journey 1 — settings persistence + share (web): persist settings, copy a share URL, permission flow ends in a shown notification", async () => {
    const { writeText } = stubWebClipboard();
    const { NotificationStub, shown } = createNotificationStub("default");
    vi.stubGlobal("Notification", NotificationStub);

    const app = createApp({
      plugins: [storePlugin, clipboardPlugin, notifyPlugin],
      pluginConfigs: { store: { name: "journey-settings-db" } }
    });
    await app.start();

    // Persist settings: set/get/keys round-trip through the real IndexedDB provider.
    expect(await app.store.set("settings.theme", "dark")).toEqual({
      ok: true,
      value: undefined,
      provider: "web"
    });
    expect(await app.store.set("settings.volume", 0.5)).toEqual({
      ok: true,
      value: undefined,
      provider: "web"
    });
    expect(await app.store.get<string>("settings.theme")).toEqual({
      ok: true,
      value: "dark",
      provider: "web"
    });
    const keys = await app.store.keys();
    expect(keys.ok).toBe(true);
    if (keys.ok) {
      expect(keys.value.toSorted()).toEqual(["settings.theme", "settings.volume"]);
    }

    // Copy a share URL — the platform clipboard stub receives exactly that string.
    const shareUrl = "https://moku.app/s/abc123";
    expect(await app.clipboard.writeText(shareUrl)).toEqual({
      ok: true,
      value: undefined,
      provider: "web"
    });
    expect(writeText).toHaveBeenCalledWith(shareUrl);

    // Notification flow: not granted → explicit prompt grants → show succeeds.
    expect(await app.notify.isPermissionGranted()).toEqual({
      ok: true,
      value: false,
      provider: "web"
    });
    expect(await app.notify.requestPermission()).toEqual({
      ok: true,
      value: true,
      provider: "web"
    });
    expect(NotificationStub.requestPermission).toHaveBeenCalledTimes(1);
    expect(await app.notify.show({ title: "Link copied", body: "Share it anywhere" })).toEqual({
      ok: true,
      value: undefined,
      provider: "web"
    });
    expect(shown).toEqual([{ title: "Link copied", body: "Share it anywhere" }]);

    await app.stop();
  });

  it("journey 2 — desktop app boot (tauri, macos): tray menu with a live click action, launch deep link routes, store reads a persisted value", async () => {
    tauriStoreData.set("user.theme", "dark"); // persisted by a previous run
    mockDeepLinkGetCurrent.mockResolvedValue(["moku://inbox/42"]);

    const framework = coreConfig.createCore(coreConfig, {
      plugins: [storePlugin, trayPlugin, deepLinkPlugin],
      pluginConfigs: {
        runtime: { forceKind: "tauri", forcePlatform: "macos" },
        store: { name: "desktop-boot-db" },
        tray: { id: "desktop-boot-tray" }
      }
    });
    const app = framework.createApp();
    await app.start();

    // Tray: build the boot menu — the OS icon is created lazily with the configured id.
    const openSettings = vi.fn();
    expect(
      await app.tray.setMenu([
        { id: "settings", text: "Settings…", action: openSettings },
        { id: "quit", text: "Quit" }
      ])
    ).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(mockTrayIconNew).toHaveBeenCalledWith({ id: "desktop-boot-tray" });
    expect(fakeTrayIcon.setMenu).toHaveBeenCalledTimes(1);

    // The native menu was built from our items and the click handler is wired: a
    // simulated OS click on "Settings…" reaches the consumer callback.
    const menuOptions = mockMenuNew.mock.calls[0]?.[0];
    expect(menuOptions?.items.map(item => item.id)).toEqual(["settings", "quit"]);
    menuOptions?.items[0]?.action?.("settings");
    expect(openSettings).toHaveBeenCalledTimes(1);

    // Deep link: the launch URL arrives through getCurrent and the app routes on it.
    const launch = await app.deepLink.getCurrent();
    expect(launch).toEqual({ ok: true, value: "moku://inbox/42", provider: "tauri" });
    let route = "home";
    if (launch.ok && typeof launch.value === "string") {
      route = new URL(launch.value).host;
    }
    expect(route).toBe("inbox");

    // Store: the value persisted by the previous run is readable at boot.
    expect(await app.store.get<string>("user.theme")).toEqual({
      ok: true,
      value: "dark",
      provider: "tauri"
    });
    expect(mockStoreLoad).toHaveBeenCalledWith("desktop-boot-db.json", {
      defaults: {},
      autoSave: false
    });

    await app.stop();
    expect(fakeTrayIcon.close).toHaveBeenCalledTimes(1); // tray icon released
    expect(mockUnlisten).toHaveBeenCalledTimes(1); // OS deep-link listener released
  });

  it("journey 3 — Safari private mode (web): store degrades to 'unavailable' + the documented in-memory fallback, clipboard and notify keep working", async () => {
    // IndexedDB denies storage: the store web provider's write-probe rejects at
    // resolution, so every store method reports the SAME deterministic failure.
    vi.stubGlobal("indexedDB", { open: openPrivateModeDatabase });
    const { writeText } = stubWebClipboard();
    const { NotificationStub, shown } = createNotificationStub("granted");
    vi.stubGlobal("Notification", NotificationStub);

    const app = createApp({
      plugins: [storePlugin, clipboardPlugin, notifyPlugin],
      pluginConfigs: { store: { name: "private-mode-db" } }
    });
    await app.start();

    expect(await app.store.set("count", 1)).toMatchObject({
      ok: false,
      provider: "web",
      reason: "unavailable"
    });

    // The documented consumer fallback (store spec consumer example):
    //   if (r.ok) use(r.value); else if (r.reason === "unavailable") fallbackToMemory();
    const memory = new Map<string, number>();
    const read = await app.store.get<number>("count");
    let count = 0;
    if (read.ok) {
      count = read.value ?? 0;
    } else if (read.reason === "unavailable") {
      memory.set("count", 1); // fallbackToMemory() — e.g. Safari private mode
      count = memory.get("count") ?? 0;
    }
    expect(read).toMatchObject({ ok: false, provider: "web", reason: "unavailable" });
    expect(count).toBe(1);
    expect(memory.size).toBe(1);

    // The degraded store never poisons its siblings in the same app.
    expect(await app.clipboard.writeText("still works")).toEqual({
      ok: true,
      value: undefined,
      provider: "web"
    });
    expect(writeText).toHaveBeenCalledWith("still works");
    expect(await app.notify.show({ title: "Saved for this session only" })).toEqual({
      ok: true,
      value: undefined,
      provider: "web"
    });
    expect(shown).toEqual([{ title: "Saved for this session only" }]);

    await app.stop();
  });

  it("journey 4 — permission-denied UX (web): show reports 'denied' without prompting; clipboard NotAllowedError routes to the manual-copy path", async () => {
    const { NotificationStub } = createNotificationStub("denied");
    vi.stubGlobal("Notification", NotificationStub);
    const readText = vi.fn(async (): Promise<string> => {
      throw new DOMException("Read permission denied.", "NotAllowedError");
    });
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { readText, writeText } });

    const app = createApp({ plugins: [notifyPlugin, clipboardPlugin] });
    await app.start();

    // show() reads permission itself — a denied user is NEVER re-prompted.
    expect(await app.notify.show({ title: "You've got mail" })).toEqual({
      ok: false,
      provider: "web",
      reason: "denied",
      message: "notification permission not granted"
    });
    expect(NotificationStub.requestPermission).not.toHaveBeenCalled();

    // Clipboard read denial arrives as typed data, not a thrown surprise.
    const paste = await app.clipboard.readText();
    expect(paste).toEqual({
      ok: false,
      provider: "web",
      reason: "denied",
      message: "Read permission denied."
    });

    // The journey falls back to the manual-copy UI purely from the typed result.
    let inputMode: "auto-paste" | "manual-copy" = "auto-paste";
    if (!paste.ok && paste.reason === "denied") {
      inputMode = "manual-copy";
    }
    expect(inputMode).toBe("manual-copy");

    await app.stop();
  });

  it("journey 5 — progressive enhancement (web): a five-capability app branches only on SystemResult discriminants — tray hides, everything else renders", async () => {
    stubWebClipboard("clip");
    const { NotificationStub } = createNotificationStub("granted");
    vi.stubGlobal("Notification", NotificationStub);

    const app = createApp({
      plugins: [storePlugin, notifyPlugin, clipboardPlugin, trayPlugin, deepLinkPlugin],
      pluginConfigs: { store: { name: "progressive-db" } }
    });
    await app.start();

    // Tray does not exist on web — the API still answers, as typed data.
    const trayResult = await app.tray.setMenu([{ id: "settings", text: "Settings" }]);
    expect(trayResult).toEqual({ ok: false, provider: "web", reason: "unsupported" });

    // UI logic branches ONLY on the discriminants — never on the runtime kind.
    let traySettingsVisible = true;
    if (!trayResult.ok && trayResult.reason === "unsupported") {
      traySettingsVisible = false; // hide the tray-settings section
    }
    expect(traySettingsVisible).toBe(false);
    expect(isUnsupported(trayResult)).toBe(true);

    // Every other capability renders on the same runtime, same discriminant logic.
    const renderResults = [
      await app.store.set("onboarded", true),
      await app.clipboard.writeText("https://moku.app"),
      await app.notify.show({ title: "Welcome" }),
      await app.deepLink.getCurrent()
    ];
    for (const result of renderResults) {
      expect(isUnsupported(result)).toBe(false);
      expect(result.ok).toBe(true);
    }

    await app.stop();
  });
});
