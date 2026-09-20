import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockIsPermissionGranted, mockRequestPermission, mockSendNotification } = vi.hoisted(() => ({
  mockIsPermissionGranted: vi.fn(),
  mockRequestPermission: vi.fn(),
  mockSendNotification: vi.fn()
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: mockIsPermissionGranted,
  requestPermission: mockRequestPermission,
  sendNotification: mockSendNotification
}));

import { createTauriNotifyProvider } from "../../providers/tauri";
import type { NotifyProvider } from "../../providers/types";
import { NOTIFY_METHODS } from "../../providers/types";
import { createWebNotifyProvider } from "../../providers/web";
import { createMockLog } from "./test-helpers";

/**
 * Minimal fake constructor matching web.ts's local structural `Notification` global
 * shape — module-scoped (not a per-call factory) since every test in this file only
 * needs the permission-granted happy path.
 */
function FakeNotificationCtor(): void {
  // intentionally empty — parity test only checks the returned SystemResult
}
FakeNotificationCtor.permission = "granted" as const;
FakeNotificationCtor.requestPermission = vi.fn(async () => "granted" as const);

beforeEach(() => {
  mockIsPermissionGranted.mockReset().mockResolvedValue(true);
  mockRequestPermission.mockReset().mockResolvedValue("granted");
  mockSendNotification.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each<{ kind: "tauri" | "web"; createProvider: () => Promise<NotifyProvider> }>([
  {
    kind: "web",
    createProvider: () => {
      vi.stubGlobal("Notification", FakeNotificationCtor);
      return createWebNotifyProvider(createMockLog());
    }
  },
  {
    kind: "tauri",
    createProvider: () => {
      // plugin-notification's sendNotification constructs `new window.Notification(...)`,
      // so the Tauri path needs the webview global just as the web path does.
      vi.stubGlobal("window", { Notification: FakeNotificationCtor });
      return createTauriNotifyProvider(createMockLog());
    }
  }
])("provider parity: $kind", ({ kind, createProvider }) => {
  it("exposes every NOTIFY_METHODS entry as a function, plus dispose", async () => {
    const provider = await createProvider();

    for (const method of NOTIFY_METHODS) {
      expect(typeof provider[method]).toBe("function");
    }
    expect(typeof provider.dispose).toBe("function");
  });

  it("permission-granted fake: isPermissionGranted/requestPermission/show all resolve ok", async () => {
    const provider = await createProvider();

    const granted = await provider.isPermissionGranted();
    const requested = await provider.requestPermission();
    const shown = await provider.show({ title: "t" });

    expect(granted).toEqual({ ok: true, value: true, provider: kind });
    expect(requested).toEqual({ ok: true, value: true, provider: kind });
    expect(shown).toEqual({ ok: true, value: undefined, provider: kind });
  });

  it("dispose is a no-op that resolves", async () => {
    const provider = await createProvider();

    await expect(provider.dispose()).resolves.toBeUndefined();
  });
});
