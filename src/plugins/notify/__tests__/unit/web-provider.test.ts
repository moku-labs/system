import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTIFY_METHODS } from "../../providers/types";
import { createWebNotifyProvider } from "../../providers/web";
import { createMockLog } from "./test-helpers";

/**
 * A minimal fake matching the local structural shape web.ts reads off
 * `globalThis.Notification` (constructor + static permission/requestPermission).
 */
function createFakeNotificationCtor(permission: "default" | "denied" | "granted") {
  const instances: Array<{ title: string; body?: string }> = [];
  const requestPermission = vi.fn(async () => permission);

  function FakeNotification(this: unknown, title: string, options?: { body?: string }) {
    instances.push(options?.body === undefined ? { title } : { title, body: options.body });
  }
  FakeNotification.permission = permission;
  FakeNotification.requestPermission = requestPermission;

  return { FakeNotification, instances, requestPermission };
}

/** A `Notification` constructor stand-in whose constructor call itself throws an Error. */
function ThrowingNotificationCtor(): void {
  throw new Error("blocked by extension");
}
ThrowingNotificationCtor.permission = "granted" as const;
ThrowingNotificationCtor.requestPermission = vi.fn(async () => "granted" as const);

/** A `Notification` constructor stand-in whose constructor call throws a raw (non-Error) value. */
function RawThrowNotificationCtor(): void {
  throw "plain string rejection";
}
RawThrowNotificationCtor.permission = "granted" as const;
RawThrowNotificationCtor.requestPermission = vi.fn(async () => "granted" as const);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createWebNotifyProvider", () => {
  describe("Notification global absent", () => {
    beforeEach(() => {
      vi.stubGlobal("Notification", undefined);
    });

    it("every method resolves to 'unsupported'", async () => {
      const provider = await createWebNotifyProvider(createMockLog());

      for (const method of NOTIFY_METHODS) {
        const result =
          method === "show" ? await provider.show({ title: "t" }) : await provider[method]();
        expect(result).toEqual({ ok: false, provider: "web", reason: "unsupported" });
      }
    });

    it("dispose is a no-op that resolves", async () => {
      const provider = await createWebNotifyProvider(createMockLog());

      await expect(provider.dispose()).resolves.toBeUndefined();
    });
  });

  describe("permission matrix", () => {
    it.each([
      "granted",
      "denied",
      "default"
    ] as const)("isPermissionGranted reflects Notification.permission === '%s'", async permission => {
      const { FakeNotification } = createFakeNotificationCtor(permission);
      vi.stubGlobal("Notification", FakeNotification);
      const provider = await createWebNotifyProvider(createMockLog());

      const result = await provider.isPermissionGranted();

      expect(result).toEqual({ ok: true, value: permission === "granted", provider: "web" });
    });

    it.each([
      "granted",
      "denied",
      "default"
    ] as const)("requestPermission resolves ok(%s === 'granted') from the returned value", async permission => {
      const { FakeNotification } = createFakeNotificationCtor(permission);
      vi.stubGlobal("Notification", FakeNotification);
      const provider = await createWebNotifyProvider(createMockLog());

      const result = await provider.requestPermission();

      expect(result).toEqual({ ok: true, value: permission === "granted", provider: "web" });
    });

    it("requestPermission maps a throw to reason 'error', never 'denied'", async () => {
      const { FakeNotification, requestPermission } = createFakeNotificationCtor("default");
      requestPermission.mockRejectedValue(new Error("prompt failed"));
      vi.stubGlobal("Notification", FakeNotification);
      const log = createMockLog();
      const provider = await createWebNotifyProvider(log);

      const result = await provider.requestPermission();

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "error",
        message: "prompt failed"
      });
      expect(log.error).toHaveBeenCalledTimes(1);
    });
  });

  describe("show — does not prompt", () => {
    it("permission granted: constructs a Notification and returns ok", async () => {
      const { FakeNotification, instances } = createFakeNotificationCtor("granted");
      vi.stubGlobal("Notification", FakeNotification);
      const provider = await createWebNotifyProvider(createMockLog());

      const result = await provider.show({ title: "Done", body: "42 items" });

      expect(result).toEqual({ ok: true, value: undefined, provider: "web" });
      expect(instances).toEqual([{ title: "Done", body: "42 items" }]);
    });

    it("permission granted, no body: constructs a Notification with title only", async () => {
      const { FakeNotification, instances } = createFakeNotificationCtor("granted");
      vi.stubGlobal("Notification", FakeNotification);
      const provider = await createWebNotifyProvider(createMockLog());

      await provider.show({ title: "Done" });

      expect(instances).toEqual([{ title: "Done" }]);
    });

    it("permission NOT granted: returns 'denied' AND never calls requestPermission (no auto-prompt)", async () => {
      const { FakeNotification, requestPermission, instances } =
        createFakeNotificationCtor("default");
      vi.stubGlobal("Notification", FakeNotification);
      const provider = await createWebNotifyProvider(createMockLog());

      const result = await provider.show({ title: "Done" });

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "denied",
        message: "notification permission not granted"
      });
      expect(requestPermission).not.toHaveBeenCalled();
      expect(instances).toEqual([]);
    });

    it("permission denied: returns 'denied' without prompting", async () => {
      const { FakeNotification, requestPermission } = createFakeNotificationCtor("denied");
      vi.stubGlobal("Notification", FakeNotification);
      const provider = await createWebNotifyProvider(createMockLog());

      const result = await provider.show({ title: "Done" });

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "denied",
        message: "notification permission not granted"
      });
      expect(requestPermission).not.toHaveBeenCalled();
    });

    it("constructor throw maps to reason 'error', never 'denied'", async () => {
      vi.stubGlobal("Notification", ThrowingNotificationCtor);
      const log = createMockLog();
      const provider = await createWebNotifyProvider(log);

      const result = await provider.show({ title: "Done" });

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "error",
        message: "blocked by extension"
      });
      expect(log.error).toHaveBeenCalledTimes(1);
    });

    it("wraps a non-Error throw into an Error for log.error while still mapping the result", async () => {
      vi.stubGlobal("Notification", RawThrowNotificationCtor);
      const log = createMockLog();
      const provider = await createWebNotifyProvider(log);

      const result = await provider.show({ title: "Done" });

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "error",
        message: "plain string rejection"
      });
      const loggedError = vi.mocked(log.error).mock.calls[0]?.[2];
      expect(loggedError).toBeInstanceOf(Error);
      expect(loggedError?.message).toBe("plain string rejection");
    });
  });
});
