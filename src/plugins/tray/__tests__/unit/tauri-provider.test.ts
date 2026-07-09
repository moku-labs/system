import { beforeEach, describe, expect, it, vi } from "vitest";

const { fakeTrayIcon, mockTrayIconNew, fakeMenu, mockMenuNew } = vi.hoisted(() => {
  const fakeTrayIcon = {
    setIcon: vi.fn(async () => undefined),
    setMenu: vi.fn(async () => undefined),
    setTooltip: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined)
  };
  const mockTrayIconNew = vi.fn(async () => fakeTrayIcon);
  const fakeMenu = {};
  type NativeMenuItemOptions = {
    id: string;
    text: string;
    enabled?: boolean;
    action?: (id: string) => void;
  };
  const mockMenuNew = vi.fn(async (_options?: { items?: NativeMenuItemOptions[] }) => fakeMenu);
  return { fakeTrayIcon, mockTrayIconNew, fakeMenu, mockMenuNew };
});

vi.mock("@tauri-apps/api/tray", () => ({ TrayIcon: { new: mockTrayIconNew } }));
vi.mock("@tauri-apps/api/menu", () => ({ Menu: { new: mockMenuNew } }));

import { createTauriTrayProvider } from "../../providers/tauri";
import { createMockLog } from "./test-helpers";

beforeEach(() => {
  mockTrayIconNew.mockClear();
  mockTrayIconNew.mockImplementation(async () => fakeTrayIcon);
  mockMenuNew.mockClear();
  mockMenuNew.mockImplementation(async () => fakeMenu);
  fakeTrayIcon.setIcon.mockReset().mockResolvedValue(undefined);
  fakeTrayIcon.setMenu.mockReset().mockResolvedValue(undefined);
  fakeTrayIcon.setTooltip.mockReset().mockResolvedValue(undefined);
  fakeTrayIcon.close.mockReset().mockResolvedValue(undefined);
});

describe("createTauriTrayProvider", () => {
  it("does not create the OS tray icon at factory time (side-effect-free resolution)", async () => {
    await createTauriTrayProvider({ id: "my-app" }, createMockLog());

    expect(mockTrayIconNew).not.toHaveBeenCalled();
  });

  it("creates the OS tray icon lazily on the FIRST mutating call only", async () => {
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

    await provider.setMenu([{ id: "quit", text: "Quit" }]);
    expect(mockTrayIconNew).toHaveBeenCalledTimes(1);
    expect(mockTrayIconNew).toHaveBeenCalledWith({ id: "my-app" });

    await provider.setTooltip("hover");
    await provider.setIcon("/icon.png");
    expect(mockTrayIconNew).toHaveBeenCalledTimes(1);
  });

  it("concurrent mutating calls with no intervening await create the icon exactly once", async () => {
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

    const [tooltipResult, iconResult] = await Promise.all([
      provider.setTooltip("a"),
      provider.setIcon("b")
    ]);

    expect(mockTrayIconNew).toHaveBeenCalledTimes(1);
    expect(tooltipResult).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(iconResult).toEqual({ ok: true, value: undefined, provider: "tauri" });
  });

  it("destroy() followed by a concurrent recreate still creates exactly one new icon", async () => {
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());
    await provider.setMenu([{ id: "quit", text: "Quit" }]);
    expect(mockTrayIconNew).toHaveBeenCalledTimes(1);

    await provider.destroy();
    expect(fakeTrayIcon.close).toHaveBeenCalledTimes(1);

    await Promise.all([provider.setTooltip("a"), provider.setIcon("b")]);

    expect(mockTrayIconNew).toHaveBeenCalledTimes(2);
  });

  it("setMenu builds a Menu from TrayMenuItem[] and forwards it to the tray icon", async () => {
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

    const result = await provider.setMenu([
      { id: "quit", text: "Quit", enabled: false },
      { id: "open", text: "Open" }
    ]);

    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(mockMenuNew).toHaveBeenCalledTimes(1);
    expect(fakeTrayIcon.setMenu).toHaveBeenCalledWith(fakeMenu);
  });

  it("setMenu maps an item's action to a click handler that invokes it", async () => {
    const action = vi.fn();
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

    await provider.setMenu([{ id: "quit", text: "Quit", action }]);

    const builtItems = mockMenuNew.mock.calls[0]?.[0]?.items;
    const builtAction = builtItems?.[0]?.action;
    expect(builtAction).toBeDefined();
    builtAction?.("quit");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("setTooltip forwards the text to the tray icon", async () => {
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

    const result = await provider.setTooltip("hover text");

    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(fakeTrayIcon.setTooltip).toHaveBeenCalledWith("hover text");
  });

  it("setIcon forwards the path to the tray icon", async () => {
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

    const result = await provider.setIcon("/path/icon.png");

    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(fakeTrayIcon.setIcon).toHaveBeenCalledWith("/path/icon.png");
  });

  it("destroy() resolves ok even when the icon was never created", async () => {
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

    const result = await provider.destroy();

    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(fakeTrayIcon.close).not.toHaveBeenCalled();
  });

  it("destroy() destroys the cached icon, and the next mutating call recreates it", async () => {
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());
    await provider.setMenu([{ id: "quit", text: "Quit" }]);
    expect(mockTrayIconNew).toHaveBeenCalledTimes(1);

    const result = await provider.destroy();
    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(fakeTrayIcon.close).toHaveBeenCalledTimes(1);

    await provider.setTooltip("hover again");
    expect(mockTrayIconNew).toHaveBeenCalledTimes(2);
  });

  it("dispose() destroys the cached icon if present", async () => {
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());
    await provider.setMenu([{ id: "quit", text: "Quit" }]);

    await provider.dispose();

    expect(fakeTrayIcon.close).toHaveBeenCalledTimes(1);
  });

  it("dispose() resolves without error when the icon was never created", async () => {
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

    await expect(provider.dispose()).resolves.toBeUndefined();
    expect(fakeTrayIcon.close).not.toHaveBeenCalled();
  });

  it("maps a method throw to reason 'error' with the message preserved, never 'denied'", async () => {
    fakeTrayIcon.setTooltip.mockRejectedValue(new Error("not allowed"));
    const log = createMockLog();
    const provider = await createTauriTrayProvider({ id: "my-app" }, log);

    const result = await provider.setTooltip("hover");

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "not allowed"
    });
    expect(result.ok ? undefined : result.reason).not.toBe("denied");
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("maps a setMenu throw to reason 'error'", async () => {
    mockMenuNew.mockRejectedValueOnce(new Error("menu build failed"));
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

    const result = await provider.setMenu([{ id: "quit", text: "Quit" }]);

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "menu build failed"
    });
  });
});
