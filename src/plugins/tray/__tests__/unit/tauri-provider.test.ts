import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  fakeTrayIcon,
  mockTrayIconNew,
  createdMenus,
  newMenu,
  mockMenuNew,
  defaultIcon,
  mockDefaultWindowIcon
} = vi.hoisted(() => {
  const fakeTrayIcon = {
    setIcon: vi.fn(async () => undefined),
    setMenu: vi.fn(async () => undefined),
    setTooltip: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined)
  };
  const mockTrayIconNew = vi.fn(async () => fakeTrayIcon);
  type NativeMenuItemOptions = {
    id: string;
    text: string;
    enabled?: boolean;
    action?: (id: string) => void;
  };
  // Every Menu.new() hands back a distinct handle, exactly like the real Rust-side
  // resource — menu lifetime is only observable when the handles are told apart.
  const createdMenus: { close: ReturnType<typeof vi.fn> }[] = [];
  const newMenu = (): { close: ReturnType<typeof vi.fn> } => {
    const menu = { close: vi.fn(async () => undefined) };
    createdMenus.push(menu);
    return menu;
  };
  const mockMenuNew = vi.fn(async (_options?: { items?: NativeMenuItemOptions[] }) => newMenu());
  // Stand-in for the Image resource @tauri-apps/api/app's defaultWindowIcon() resolves
  // to. It is a Rust-side Resource: TrayIcon.new only reads its rid, so the caller that
  // created it still owns it and has to close it.
  const defaultIcon = { rid: 1, close: vi.fn(async () => undefined) };
  const mockDefaultWindowIcon = vi.fn(async () => defaultIcon as typeof defaultIcon | null);
  return {
    fakeTrayIcon,
    mockTrayIconNew,
    createdMenus,
    newMenu,
    mockMenuNew,
    defaultIcon,
    mockDefaultWindowIcon
  };
});

vi.mock("@tauri-apps/api/tray", () => ({ TrayIcon: { new: mockTrayIconNew } }));
vi.mock("@tauri-apps/api/menu", () => ({ Menu: { new: mockMenuNew } }));
vi.mock("@tauri-apps/api/app", () => ({ defaultWindowIcon: mockDefaultWindowIcon }));

import { createTauriTrayProvider } from "../../providers/tauri";
import { createMockLog } from "./test-helpers";

/**
 * Drain the microtask queue so anything a queued call *would* have done has had every
 * chance to happen before the test asserts that it did not.
 */
const flushMicrotasks = async (): Promise<void> => {
  for (let tick = 0; tick < 50; tick += 1) {
    await Promise.resolve();
  }
};

beforeEach(() => {
  mockTrayIconNew.mockClear();
  mockTrayIconNew.mockImplementation(async () => fakeTrayIcon);
  createdMenus.length = 0;
  mockMenuNew.mockClear();
  mockMenuNew.mockImplementation(async () => newMenu());
  mockDefaultWindowIcon.mockClear();
  mockDefaultWindowIcon.mockImplementation(async () => defaultIcon);
  defaultIcon.close.mockReset().mockResolvedValue(undefined);
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
    expect(mockTrayIconNew).toHaveBeenCalledWith({ id: "my-app", icon: defaultIcon });

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

  it("a transient icon-creation failure returns a SystemErr and the NEXT mutating call retries (and can succeed)", async () => {
    mockTrayIconNew.mockRejectedValueOnce(new Error("transient OS failure"));
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

    const failed = await provider.setTooltip("first attempt");
    expect(failed).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "transient OS failure"
    });
    expect(mockTrayIconNew).toHaveBeenCalledTimes(1);

    const retried = await provider.setTooltip("second attempt");
    expect(retried).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(mockTrayIconNew).toHaveBeenCalledTimes(2);
  });

  it("destroy() and dispose() both resolve cleanly after a failed icon creation (no leaked rejection)", async () => {
    mockTrayIconNew.mockRejectedValueOnce(new Error("transient OS failure"));
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());
    await provider.setTooltip("triggers the failing creation");

    const destroyResult = await provider.destroy();
    expect(destroyResult).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(fakeTrayIcon.close).not.toHaveBeenCalled();

    await expect(provider.dispose()).resolves.toBeUndefined();
  });

  it("dispose() alone resolves cleanly after a failed icon creation", async () => {
    mockTrayIconNew.mockRejectedValueOnce(new Error("transient OS failure"));
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());
    await provider.setIcon("/icon.png");

    await expect(provider.dispose()).resolves.toBeUndefined();
    expect(fakeTrayIcon.close).not.toHaveBeenCalled();
  });

  it("setMenu builds a Menu from TrayMenuItem[] and forwards it to the tray icon", async () => {
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

    const result = await provider.setMenu([
      { id: "quit", text: "Quit", enabled: false },
      { id: "open", text: "Open" }
    ]);

    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(mockMenuNew).toHaveBeenCalledTimes(1);
    expect(fakeTrayIcon.setMenu).toHaveBeenCalledWith(createdMenus[0]);
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

  describe("status-item icon", () => {
    it("uses the app's default window icon when tray.icon is not configured", async () => {
      const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

      await provider.setTooltip("hover");

      expect(mockDefaultWindowIcon).toHaveBeenCalledTimes(1);
      expect(mockTrayIconNew).toHaveBeenCalledWith({ id: "my-app", icon: defaultIcon });
    });

    it("passes a configured tray.icon straight through and never asks for the default", async () => {
      const provider = await createTauriTrayProvider(
        { id: "my-app", icon: "/Applications/My.app/Contents/Resources/tray.png" },
        createMockLog()
      );

      await provider.setTooltip("hover");

      expect(mockTrayIconNew).toHaveBeenCalledWith({
        id: "my-app",
        icon: "/Applications/My.app/Contents/Resources/tray.png"
      });
      expect(mockDefaultWindowIcon).not.toHaveBeenCalled();
    });

    it("reports 'unavailable' naming tray.icon when the icon file is missing", async () => {
      mockTrayIconNew.mockRejectedValueOnce(
        new Error("failed to read icon: No such file or directory (os error 2)")
      );
      const provider = await createTauriTrayProvider(
        { id: "my-app", icon: "missing.png" },
        createMockLog()
      );

      const result = await provider.setMenu([{ id: "quit", text: "Quit" }]);

      expect(result.ok).toBe(false);
      expect(result.ok ? undefined : result.reason).toBe("unavailable");
      expect(result.ok ? "" : result.message).toContain("tray.icon");
    });

    it("closes the default window icon Image once the status item has been created", async () => {
      const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

      await provider.setTooltip("hover");

      expect(mockTrayIconNew).toHaveBeenCalledTimes(1);
      expect(defaultIcon.close).toHaveBeenCalledTimes(1);
    });

    it("closes the default window icon Image even when creating the status item fails", async () => {
      mockTrayIconNew.mockRejectedValueOnce(new Error("transient OS failure"));
      const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

      const result = await provider.setTooltip("hover");

      expect(result.ok).toBe(false);
      expect(defaultIcon.close).toHaveBeenCalledTimes(1);
    });

    it("a failing default-icon close never surfaces on the caller's result", async () => {
      defaultIcon.close.mockRejectedValue(new Error("image already closed"));
      const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

      const result = await provider.setTooltip("hover");

      expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
    });

    it("never closes a configured tray.icon — the provider does not own it", async () => {
      const provider = await createTauriTrayProvider(
        { id: "my-app", icon: "/Applications/My.app/Contents/Resources/tray.png" },
        createMockLog()
      );

      await provider.setTooltip("hover");

      expect(defaultIcon.close).not.toHaveBeenCalled();
    });

    it("reports 'unavailable' naming tray.icon when the app has no default window icon", async () => {
      // eslint-disable-next-line unicorn/no-null -- defaultWindowIcon() resolves Image | null
      mockDefaultWindowIcon.mockResolvedValue(null);
      const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

      const result = await provider.setTooltip("hover");

      expect(result.ok).toBe(false);
      expect(result.ok ? undefined : result.reason).toBe("unavailable");
      expect(result.ok ? "" : result.message).toContain("tray.icon");
      expect(mockTrayIconNew).not.toHaveBeenCalled();
    });
  });

  describe("menu lifetime", () => {
    it("closes the previous menu after the replacement is attached, and keeps the current one open", async () => {
      const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

      await provider.setMenu([{ id: "a", text: "A" }]);
      await provider.setMenu([{ id: "b", text: "B" }]);

      expect(createdMenus).toHaveLength(2);
      expect(createdMenus[0]?.close).toHaveBeenCalledTimes(1);
      expect(createdMenus[1]?.close).not.toHaveBeenCalled();
    });

    it("closes the menu it just built when attaching it fails, so the failure leaks nothing", async () => {
      fakeTrayIcon.setMenu.mockRejectedValueOnce(new Error("setMenu failed"));
      const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

      const result = await provider.setMenu([{ id: "a", text: "A" }]);

      expect(result.ok).toBe(false);
      expect(createdMenus[0]?.close).toHaveBeenCalledTimes(1);
    });

    it("destroy() closes the current menu along with the icon", async () => {
      const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());
      await provider.setMenu([{ id: "a", text: "A" }]);

      await provider.destroy();

      expect(createdMenus[0]?.close).toHaveBeenCalledTimes(1);
      expect(fakeTrayIcon.close).toHaveBeenCalledTimes(1);
    });

    it("dispose() closes the current menu along with the icon", async () => {
      const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());
      await provider.setMenu([{ id: "a", text: "A" }]);

      await provider.dispose();

      expect(createdMenus[0]?.close).toHaveBeenCalledTimes(1);
      expect(fakeTrayIcon.close).toHaveBeenCalledTimes(1);
    });

    it("destroy() does not double-close the menu when called twice", async () => {
      const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());
      await provider.setMenu([{ id: "a", text: "A" }]);

      await provider.destroy();
      await provider.destroy();

      expect(createdMenus[0]?.close).toHaveBeenCalledTimes(1);
    });

    it("serializes overlapping setMenu calls, even when the native swap resolves out of order", async () => {
      const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());
      // The first native swap hangs until released — long enough for a second setMenu
      // to overtake it and, unserialized, close the menu the first one is attaching.
      let releaseFirstSwap = (): void => undefined;
      let firstSwapStarted = (): void => undefined;
      const reachedNativeSwap = new Promise<void>(started => {
        firstSwapStarted = started;
      });
      fakeTrayIcon.setMenu.mockImplementationOnce(
        () =>
          new Promise<undefined>(resolve => {
            releaseFirstSwap = (): void => resolve(undefined);
            firstSwapStarted();
          })
      );

      const first = provider.setMenu([{ id: "a", text: "A" }]);
      await reachedNativeSwap;
      const second = provider.setMenu([{ id: "b", text: "B" }]);
      await flushMicrotasks();

      // The second swap has not built a menu, let alone attached one.
      expect(mockMenuNew).toHaveBeenCalledTimes(1);
      expect(fakeTrayIcon.setMenu).toHaveBeenCalledTimes(1);

      releaseFirstSwap();
      const results = await Promise.all([first, second]);

      expect(results).toEqual([
        { ok: true, value: undefined, provider: "tauri" },
        { ok: true, value: undefined, provider: "tauri" }
      ]);
      expect(fakeTrayIcon.setMenu).toHaveBeenNthCalledWith(1, createdMenus[0]);
      expect(fakeTrayIcon.setMenu).toHaveBeenNthCalledWith(2, createdMenus[1]);
      expect(createdMenus[0]?.close).toHaveBeenCalledTimes(1);
      expect(createdMenus[1]?.close).not.toHaveBeenCalled();
    });

    it("a failing swap does not poison the queue — the next setMenu still runs", async () => {
      fakeTrayIcon.setMenu.mockRejectedValueOnce(new Error("setMenu failed"));
      const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());

      const failed = await provider.setMenu([{ id: "a", text: "A" }]);
      const recovered = await provider.setMenu([{ id: "b", text: "B" }]);

      expect(failed.ok).toBe(false);
      expect(recovered).toEqual({ ok: true, value: undefined, provider: "tauri" });
      expect(fakeTrayIcon.setMenu).toHaveBeenNthCalledWith(2, createdMenus[1]);
    });

    it("a failing menu close is logged and never breaks the call", async () => {
      const log = createMockLog();
      const provider = await createTauriTrayProvider({ id: "my-app" }, log);
      await provider.setMenu([{ id: "a", text: "A" }]);
      createdMenus[0]?.close.mockRejectedValue(new Error("menu already closed"));

      const result = await provider.setMenu([{ id: "b", text: "B" }]);

      expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
      expect(log.error).toHaveBeenCalledTimes(1);
    });
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

  it("answers every method with 'app stopped' once disposed instead of recreating the status item", async () => {
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());
    await provider.dispose();
    mockTrayIconNew.mockClear();
    mockMenuNew.mockClear();

    const stopped = { ok: false, provider: "tauri", reason: "unavailable", message: "app stopped" };
    expect(await provider.setMenu([{ id: "quit", text: "Quit" }])).toEqual(stopped);
    expect(await provider.setTooltip("hover")).toEqual(stopped);
    expect(await provider.setIcon("/path/icon.png")).toEqual(stopped);
    expect(await provider.destroy()).toEqual(stopped);

    expect(mockTrayIconNew).not.toHaveBeenCalled();
    expect(mockMenuNew).not.toHaveBeenCalled();
  });

  it("dispose is idempotent — a second call never closes the freed status item twice", async () => {
    const provider = await createTauriTrayProvider({ id: "my-app" }, createMockLog());
    await provider.setTooltip("hover");

    await provider.dispose();
    await provider.dispose();

    expect(fakeTrayIcon.close).toHaveBeenCalledTimes(1);
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
