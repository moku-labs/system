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

import { loadNotifyProvider } from "../../providers/index";
import type { NotifyContext } from "../../types";
import { createMockLog } from "./test-helpers";

/** Minimal fake constructor matching web.ts's local structural `Notification` global shape. */
function FakeNotificationCtor(): void {
  // no-op fake
}
FakeNotificationCtor.permission = "granted" as const;
FakeNotificationCtor.requestPermission = vi.fn(async () => "granted" as const);

const createMockCtx = (overrides?: Partial<NotifyContext>): NotifyContext => ({
  config: {},
  // eslint-disable-next-line unicorn/no-null -- NotifyState.provider is typed `Promise<...> | null` (seam contract)
  state: overrides?.state ?? { provider: null },
  emit: overrides?.emit ?? vi.fn(),
  global: overrides?.global ?? {},
  runtime: overrides?.runtime ?? { kind: "web", platform: "unknown" },
  log: overrides?.log ?? createMockLog()
});

beforeEach(() => {
  mockIsPermissionGranted.mockReset().mockResolvedValue(true);
  mockRequestPermission.mockReset().mockResolvedValue("granted");
  mockSendNotification.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadNotifyProvider", () => {
  it("selects the Tauri provider when ctx.runtime.kind is 'tauri'", async () => {
    const ctx = createMockCtx({ runtime: { kind: "tauri", platform: "macos" } });

    const load = loadNotifyProvider(ctx);
    const provider = await load();

    const result = await provider.isPermissionGranted();
    expect(result.provider).toBe("tauri");
  });

  it("selects the web provider when ctx.runtime.kind is 'web'", async () => {
    vi.stubGlobal("Notification", FakeNotificationCtor);

    const ctx = createMockCtx({ runtime: { kind: "web", platform: "unknown" } });

    const load = loadNotifyProvider(ctx);
    const provider = await load();

    const result = await provider.isPermissionGranted();
    expect(result.provider).toBe("web");
  });
});
