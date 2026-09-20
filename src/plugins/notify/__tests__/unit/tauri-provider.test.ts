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
import { createMockLog } from "./test-helpers";

beforeEach(() => {
  mockIsPermissionGranted.mockReset().mockResolvedValue(true);
  mockRequestPermission.mockReset().mockResolvedValue("granted");
  mockSendNotification.mockReset();
  // The plugin's sendNotification constructs `new window.Notification(...)`, so the
  // webview global is part of the contract every show() test depends on.
  vi.stubGlobal("window", { Notification: class {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
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

  it("show — window.Notification absent inside the shell: returns 'unavailable', not 'error'", async () => {
    vi.stubGlobal("window", {});
    const provider = await createTauriNotifyProvider(createMockLog());

    const result = await provider.show({ title: "Done" });

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "unavailable",
      message: "window.Notification is unavailable in this webview"
    });
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("show — no window global at all (SSR): returns 'unavailable'", async () => {
    vi.unstubAllGlobals();
    const provider = await createTauriNotifyProvider(createMockLog());

    const result = await provider.show({ title: "Done" });

    expect(result.ok ? undefined : result.reason).toBe("unavailable");
  });

  describe("granted-state cache", () => {
    it("show reuses the cached granted state instead of round-tripping every call", async () => {
      mockIsPermissionGranted.mockResolvedValue(true);
      const provider = await createTauriNotifyProvider(createMockLog());

      await provider.show({ title: "one" });
      await provider.show({ title: "two" });
      await provider.show({ title: "three" });

      expect(mockIsPermissionGranted).toHaveBeenCalledTimes(1);
      expect(mockSendNotification).toHaveBeenCalledTimes(3);
    });

    it("requestPermission refreshes the cache, so the next show goes through without a re-check", async () => {
      mockIsPermissionGranted.mockResolvedValue(false);
      mockRequestPermission.mockResolvedValue("granted");
      const provider = await createTauriNotifyProvider(createMockLog());

      const denied = await provider.show({ title: "before" });
      expect(denied.ok).toBe(false);

      await provider.requestPermission();
      const allowed = await provider.show({ title: "after" });

      expect(allowed).toEqual({ ok: true, value: undefined, provider: "tauri" });
      expect(mockIsPermissionGranted).toHaveBeenCalledTimes(1);
    });

    it("a 'denied' requestPermission response invalidates a previously granted cache", async () => {
      mockIsPermissionGranted.mockResolvedValue(true);
      mockRequestPermission.mockResolvedValue("denied");
      const provider = await createTauriNotifyProvider(createMockLog());
      await provider.show({ title: "before" });

      await provider.requestPermission();
      const result = await provider.show({ title: "after" });

      expect(result).toEqual({
        ok: false,
        provider: "tauri",
        reason: "denied",
        message: "notification permission not granted"
      });
    });

    it("isPermissionGranted always reads through and refreshes the cache", async () => {
      mockIsPermissionGranted.mockResolvedValue(true);
      const provider = await createTauriNotifyProvider(createMockLog());
      await provider.show({ title: "warms the cache" });

      mockIsPermissionGranted.mockResolvedValue(false);
      const fresh = await provider.isPermissionGranted();
      const afterRevoke = await provider.show({ title: "after" });

      expect(fresh).toEqual({ ok: true, value: false, provider: "tauri" });
      expect(afterRevoke.ok).toBe(false);
      expect(mockIsPermissionGranted).toHaveBeenCalledTimes(2);
    });

    it("a throw from the first permission read is not cached — the next show retries", async () => {
      mockIsPermissionGranted.mockRejectedValueOnce(new Error("ipc unavailable"));
      const provider = await createTauriNotifyProvider(createMockLog());

      const failed = await provider.show({ title: "first" });
      const retried = await provider.show({ title: "second" });

      expect(failed.ok).toBe(false);
      expect(retried).toEqual({ ok: true, value: undefined, provider: "tauri" });
      expect(mockIsPermissionGranted).toHaveBeenCalledTimes(2);
    });
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
