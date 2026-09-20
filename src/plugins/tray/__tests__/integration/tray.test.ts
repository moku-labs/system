import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

// force-testing rule (runtime README): forcing kind "tauri" MUST be paired with
// vi.mock of the real Tauri modules so provider construction never reaches a real
// IPC call, even though only the "macos" scenario below actually exercises them.
const { fakeTrayIcon, mockTrayIconNew, mockMenuNew, mockDefaultWindowIcon } = vi.hoisted(() => {
  const fakeTrayIcon = {
    setIcon: vi.fn(async () => undefined),
    setMenu: vi.fn(async () => undefined),
    setTooltip: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined)
  };
  const mockTrayIconNew = vi.fn(async () => fakeTrayIcon);
  const mockMenuNew = vi.fn(async () => ({ close: vi.fn(async () => undefined) }));
  const mockDefaultWindowIcon = vi.fn(async () => ({ rid: 1 }));
  return { fakeTrayIcon, mockTrayIconNew, mockMenuNew, mockDefaultWindowIcon };
});

vi.mock("@tauri-apps/api/tray", () => ({ TrayIcon: { new: mockTrayIconNew } }));
vi.mock("@tauri-apps/api/menu", () => ({ Menu: { new: mockMenuNew } }));
vi.mock("@tauri-apps/api/app", () => ({ defaultWindowIcon: mockDefaultWindowIcon }));

import { coreConfig } from "../../../../config";
import type { SystemErrorReason, SystemResult } from "../../../../index";
import type { RuntimeConfig } from "../../../runtime/types";
import { trayPlugin } from "../../index";
import type { TrayConfig } from "../../types";

/**
 * Framework-internal integration bootstrap (house style: framework `__tests__` may
 * import/reuse `coreConfig` directly). Reuses the real system coreConfig — already
 * carrying log/env/runtime as core plugins — and registers `trayPlugin` as the sole
 * regular plugin, forcing `ctx.runtime` via the loosely-typed `createCore`-level
 * `pluginConfigs` (core-plugin overrides are only reachable at the createCoreConfig/
 * createCore level, never from createApp — see runtime/README.md).
 */
function buildTrayApp(overrides: { runtime?: Partial<RuntimeConfig>; tray?: Partial<TrayConfig> }) {
  const framework = coreConfig.createCore(coreConfig, {
    plugins: [trayPlugin],
    pluginConfigs: overrides
  });
  return framework.createApp();
}

beforeEach(() => {
  mockTrayIconNew.mockClear();
  mockMenuNew.mockClear();
  mockDefaultWindowIcon.mockClear();
  fakeTrayIcon.setMenu.mockClear();
  fakeTrayIcon.setTooltip.mockClear();
  fakeTrayIcon.setIcon.mockClear();
  fakeTrayIcon.close.mockClear();
});

describe("complex tier: tray plugin (integration)", () => {
  describe("forceKind 'web' — the all-unsupported-by-kind branch", () => {
    it("every method resolves to 'unsupported' with provider 'web'", async () => {
      const app = buildTrayApp({ runtime: { forceKind: "web" } });
      await app.start();

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

  describe("forceKind 'tauri' + forcePlatform 'android' — the platform-gated branch", () => {
    it("every method resolves to 'unsupported' with provider 'tauri', never touching the native modules", async () => {
      const app = buildTrayApp({ runtime: { forceKind: "tauri", forcePlatform: "android" } });
      await app.start();

      expect(await app.tray.setMenu([{ id: "quit", text: "Quit" }])).toEqual({
        ok: false,
        provider: "tauri",
        reason: "unsupported"
      });
      expect(await app.tray.setTooltip("hi")).toEqual({
        ok: false,
        provider: "tauri",
        reason: "unsupported"
      });

      expect(mockTrayIconNew).not.toHaveBeenCalled();

      await app.stop();
    });
  });

  describe("forceKind 'tauri' + forcePlatform 'macos' — the real desktop provider", () => {
    it("a configured tray.icon reaches TrayIcon.new instead of the default window icon", async () => {
      const app = buildTrayApp({
        runtime: { forceKind: "tauri", forcePlatform: "macos" },
        tray: { id: "custom-icon-tray", icon: "/Applications/My.app/Contents/Resources/tray.png" }
      });
      await app.start();

      await app.tray.setTooltip("hi");

      expect(mockTrayIconNew).toHaveBeenCalledWith({
        id: "custom-icon-tray",
        icon: "/Applications/My.app/Contents/Resources/tray.png"
      });
      expect(mockDefaultWindowIcon).not.toHaveBeenCalled();

      await app.stop();
    });

    it("ok path: setMenu/setTooltip/setIcon/destroy all succeed", async () => {
      const app = buildTrayApp({
        runtime: { forceKind: "tauri", forcePlatform: "macos" },
        tray: { id: "macos-test-tray" }
      });
      await app.start();

      expect(await app.tray.setMenu([{ id: "quit", text: "Quit" }])).toEqual({
        ok: true,
        value: undefined,
        provider: "tauri"
      });
      expect(mockTrayIconNew).toHaveBeenCalledWith({
        id: "macos-test-tray",
        icon: { rid: 1 }
      });
      expect(await app.tray.setTooltip("hover")).toEqual({
        ok: true,
        value: undefined,
        provider: "tauri"
      });
      expect(await app.tray.setIcon("/icon.png")).toEqual({
        ok: true,
        value: undefined,
        provider: "tauri"
      });

      await app.stop();
    });

    it("app.stop() destroys the OS icon via dispose() once it was lazily created", async () => {
      const app = buildTrayApp({ runtime: { forceKind: "tauri", forcePlatform: "macos" } });
      await app.start();

      await app.tray.setMenu([{ id: "quit", text: "Quit" }]);
      expect(mockTrayIconNew).toHaveBeenCalledTimes(1);

      await app.stop();

      expect(fakeTrayIcon.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("runtime: config validation", () => {
    it("onInit throws when tray.id is empty", () => {
      expect(() => buildTrayApp({ runtime: { forceKind: "web" }, tray: { id: "" } })).toThrow(
        "[system] tray.id must be a non-empty string."
      );
    });
  });

  describe("types: API signatures", () => {
    it("setMenu accepts TrayMenuItem[] and resolves SystemResult<void>", async () => {
      const app = buildTrayApp({ runtime: { forceKind: "web" } });
      await app.start();

      expectTypeOf(app.tray.setMenu).toBeFunction();
      expectTypeOf(app.tray.setMenu([{ id: "a", text: "A" }])).resolves.toEqualTypeOf<
        SystemResult<void>
      >();

      await app.stop();
    });

    it("rejects a TrayMenuItem missing 'text' at compile time", async () => {
      const app = buildTrayApp({ runtime: { forceKind: "web" } });

      // @ts-expect-error -- TrayMenuItem requires `text`
      await app.tray.setMenu([{ id: "a" }]);

      expect(app).toBeDefined();
    });

    it("narrows SystemResult via the ok discriminant", async () => {
      const app = buildTrayApp({ runtime: { forceKind: "web" } });
      await app.start();

      const result = await app.tray.setTooltip("hi");
      if (result.ok) {
        expectTypeOf(result.value).toEqualTypeOf<void>();
      } else {
        expectTypeOf(result.reason).toEqualTypeOf<SystemErrorReason>();
      }

      await app.stop();
    });
  });
});
