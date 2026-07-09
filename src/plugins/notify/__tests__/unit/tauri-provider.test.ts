import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { createMockLog } from "./test-helpers";

beforeEach(() => {
  mockIsPermissionGranted.mockReset().mockResolvedValue(true);
  mockRequestPermission.mockReset().mockResolvedValue("granted");
  mockSendNotification.mockReset();
});

describe("createTauriNotifyProvider", () => {
  it("isPermissionGranted returns ok(true) when the plugin reports granted", async () => {
    mockIsPermissionGranted.mockResolvedValue(true);
    const provider = await createTauriNotifyProvider(createMockLog());

    const result = await provider.isPermissionGranted();

    expect(result).toEqual({ ok: true, value: true, provider: "tauri" });
  });

  it("isPermissionGranted returns ok(false) when the plugin reports not granted", async () => {
    mockIsPermissionGranted.mockResolvedValue(false);
    const provider = await createTauriNotifyProvider(createMockLog());

    const result = await provider.isPermissionGranted();

    expect(result).toEqual({ ok: true, value: false, provider: "tauri" });
  });

  it("isPermissionGranted maps a throw to reason 'error', never 'denied'", async () => {
    mockIsPermissionGranted.mockRejectedValue(new Error("ipc unavailable"));
    const log = createMockLog();
    const provider = await createTauriNotifyProvider(log);

    const result = await provider.isPermissionGranted();

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "ipc unavailable"
    });
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("requestPermission returns ok(true) for a 'granted' response", async () => {
    mockRequestPermission.mockResolvedValue("granted");
    const provider = await createTauriNotifyProvider(createMockLog());

    const result = await provider.requestPermission();

    expect(result).toEqual({ ok: true, value: true, provider: "tauri" });
  });

  it("requestPermission returns ok(false) for a 'denied' response (returned value, not a throw)", async () => {
    mockRequestPermission.mockResolvedValue("denied");
    const provider = await createTauriNotifyProvider(createMockLog());

    const result = await provider.requestPermission();

    expect(result).toEqual({ ok: true, value: false, provider: "tauri" });
  });

  it("requestPermission maps a throw to reason 'error', never 'denied'", async () => {
    mockRequestPermission.mockRejectedValue(new Error("prompt failed"));
    const log = createMockLog();
    const provider = await createTauriNotifyProvider(log);

    const result = await provider.requestPermission();

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "prompt failed"
    });
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("show — permission granted: calls sendNotification and returns ok", async () => {
    mockIsPermissionGranted.mockResolvedValue(true);
    const provider = await createTauriNotifyProvider(createMockLog());

    const result = await provider.show({ title: "Done", body: "42 items" });

    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(mockSendNotification).toHaveBeenCalledWith({ title: "Done", body: "42 items" });
  });

  it("show — permission NOT granted: returns 'denied' AND never calls requestPermission (no auto-prompt)", async () => {
    mockIsPermissionGranted.mockResolvedValue(false);
    const provider = await createTauriNotifyProvider(createMockLog());

    const result = await provider.show({ title: "Done" });

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "denied",
      message: "notification permission not granted"
    });
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("show maps a throw from isPermissionGranted to reason 'error', never 'denied'", async () => {
    mockIsPermissionGranted.mockRejectedValue(new Error("ipc unavailable"));
    const log = createMockLog();
    const provider = await createTauriNotifyProvider(log);

    const result = await provider.show({ title: "Done" });

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "ipc unavailable"
    });
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("show maps a throw from sendNotification to reason 'error', never 'denied'", async () => {
    mockIsPermissionGranted.mockResolvedValue(true);
    mockSendNotification.mockImplementation(() => {
      throw new Error("send failed");
    });
    const log = createMockLog();
    const provider = await createTauriNotifyProvider(log);

    const result = await provider.show({ title: "Done" });

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "send failed"
    });
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("wraps a non-Error throw into an Error for log.error while still mapping the result", async () => {
    mockIsPermissionGranted.mockRejectedValue("plain string rejection");
    const log = createMockLog();
    const provider = await createTauriNotifyProvider(log);

    const result = await provider.isPermissionGranted();

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "plain string rejection"
    });
    const loggedError = vi.mocked(log.error).mock.calls[0]?.[2];
    expect(loggedError).toBeInstanceOf(Error);
    expect(loggedError?.message).toBe("plain string rejection");
  });

  it("dispose is a no-op that resolves", async () => {
    const provider = await createTauriNotifyProvider(createMockLog());

    await expect(provider.dispose()).resolves.toBeUndefined();
  });
});
