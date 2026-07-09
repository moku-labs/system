import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTrayIconNew, mockMenuNew } = vi.hoisted(() => {
  const fakeTrayIcon = {
    setIcon: vi.fn(async () => undefined),
    setMenu: vi.fn(async () => undefined),
    setTooltip: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined)
  };
  const mockTrayIconNew = vi.fn(async () => fakeTrayIcon);
  const mockMenuNew = vi.fn(async () => ({}));
  return { mockTrayIconNew, mockMenuNew };
});

vi.mock("@tauri-apps/api/tray", () => ({ TrayIcon: { new: mockTrayIconNew } }));
vi.mock("@tauri-apps/api/menu", () => ({ Menu: { new: mockMenuNew } }));

import { createTauriTrayProvider } from "../../providers/tauri";
import type { TrayProvider } from "../../providers/types";
import { TRAY_METHODS } from "../../providers/types";
import { createWebTrayProvider } from "../../providers/web";
import { createMockLog } from "./test-helpers";

const invokers: Record<
  (typeof TRAY_METHODS)[number],
  (provider: TrayProvider) => Promise<unknown>
> = {
  setMenu: provider => provider.setMenu([]),
  setTooltip: provider => provider.setTooltip("hi"),
  setIcon: provider => provider.setIcon("/icon.png"),
  destroy: provider => provider.destroy()
};

beforeEach(() => {
  mockTrayIconNew.mockClear();
  mockMenuNew.mockClear();
});

describe("provider parity: TrayProvider contract", () => {
  it("createWebTrayProvider satisfies TrayProvider", () => {
    const provider = createWebTrayProvider();

    for (const method of TRAY_METHODS) {
      expect(typeof provider[method]).toBe("function");
    }
    expect(typeof provider.dispose).toBe("function");
  });

  it("createTauriTrayProvider satisfies TrayProvider", async () => {
    const provider = await createTauriTrayProvider({ id: "contract-tauri" }, createMockLog());

    for (const method of TRAY_METHODS) {
      expect(typeof provider[method]).toBe("function");
    }
    expect(typeof provider.dispose).toBe("function");
  });

  it("the web provider is uniformly 'unsupported' across every TRAY_METHODS entry", async () => {
    const provider = createWebTrayProvider();

    for (const method of TRAY_METHODS) {
      const result = await invokers[method](provider);
      expect(result).toEqual({ ok: false, provider: "web", reason: "unsupported" });
    }
  });

  it("the web provider's dispose() is a no-op that resolves", async () => {
    const provider = createWebTrayProvider();

    await expect(provider.dispose()).resolves.toBeUndefined();
  });
});
