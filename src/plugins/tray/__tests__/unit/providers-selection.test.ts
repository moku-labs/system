import { beforeEach, describe, expect, it, vi } from "vitest";

// force-testing rule: forcing kind "tauri" is paired with vi.mock of both
// @tauri-apps/api/tray and @tauri-apps/api/menu, so provider construction never
// reaches a real IPC call even when the desktop branch is selected below.
const { fakeTrayIcon, mockTrayIconNew, mockMenuNew } = vi.hoisted(() => {
  const fakeTrayIcon = {
    setIcon: vi.fn(async () => undefined),
    setMenu: vi.fn(async () => undefined),
    setTooltip: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined)
  };
  const mockTrayIconNew = vi.fn(async () => fakeTrayIcon);
  const mockMenuNew = vi.fn(async () => ({}));
  return { fakeTrayIcon, mockTrayIconNew, mockMenuNew };
});

vi.mock("@tauri-apps/api/tray", () => ({ TrayIcon: { new: mockTrayIconNew } }));
vi.mock("@tauri-apps/api/menu", () => ({ Menu: { new: mockMenuNew } }));

import type { RuntimePlatform, SystemResult } from "../../../runtime/result";
import { loadTrayProvider } from "../../providers/index";
import type { TrayProvider } from "../../providers/types";
import { TRAY_METHODS } from "../../providers/types";
import type { TrayContext } from "../../types";
import { createMockLog } from "./test-helpers";

const invokers: Record<
  (typeof TRAY_METHODS)[number],
  (provider: TrayProvider) => Promise<SystemResult<void>>
> = {
  setMenu: provider => provider.setMenu([]),
  setTooltip: provider => provider.setTooltip("hi"),
  setIcon: provider => provider.setIcon("/icon.png"),
  destroy: provider => provider.destroy()
};

const createCtx = (runtime: TrayContext["runtime"]): TrayContext => ({
  config: { id: "test-tray" },
  // eslint-disable-next-line unicorn/no-null -- TrayState.provider is typed `Promise<...> | null` (seam contract)
  state: { provider: null },
  emit: vi.fn(),
  global: {},
  runtime,
  log: createMockLog()
});

beforeEach(() => {
  mockTrayIconNew.mockClear();
  mockMenuNew.mockClear();
  fakeTrayIcon.close.mockClear();
});

describe("loadTrayProvider — three-way selection", () => {
  it("kind 'web' selects the all-unsupported web provider for every platform", async () => {
    const ctx = createCtx({ kind: "web", platform: "macos" });

    const provider = await loadTrayProvider(ctx)();

    for (const method of TRAY_METHODS) {
      const result = await invokers[method](provider);
      expect(result).toEqual({ ok: false, provider: "web", reason: "unsupported" });
    }
    expect(mockTrayIconNew).not.toHaveBeenCalled();
  });

  it.each<RuntimePlatform>([
    "ios",
    "android",
    "unknown"
  ])("kind 'tauri' + platform '%s' selects the all-unsupported tauri provider (platform-gated)", async platform => {
    const ctx = createCtx({ kind: "tauri", platform });

    const provider = await loadTrayProvider(ctx)();

    for (const method of TRAY_METHODS) {
      const result = await invokers[method](provider);
      expect(result).toEqual({ ok: false, provider: "tauri", reason: "unsupported" });
    }
    expect(mockTrayIconNew).not.toHaveBeenCalled();
  });

  it.each<RuntimePlatform>([
    "macos",
    "windows",
    "linux"
  ])("kind 'tauri' + platform '%s' selects the real Tauri desktop provider", async platform => {
    const ctx = createCtx({ kind: "tauri", platform });

    const provider = await loadTrayProvider(ctx)();
    const result = await provider.setMenu([{ id: "quit", text: "Quit" }]);

    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(mockTrayIconNew).toHaveBeenCalledWith({ id: "test-tray" });
  });
});
