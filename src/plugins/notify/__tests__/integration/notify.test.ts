import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { coreConfig } from "../../../../config";
import type { SystemErrorReason, SystemResult } from "../../../../index";
import type { RuntimeConfig } from "../../../runtime/types";
import { notifyPlugin } from "../../index";

/**
 * A minimal fake matching the local structural shape `providers/web.ts` reads off
 * `globalThis.Notification` (constructor + static permission/requestPermission).
 */
function createFakeNotificationCtor(permission: "default" | "denied" | "granted") {
  const instances: Array<{ title: string; body?: string }> = [];
  function FakeNotification(this: unknown, title: string, options?: { body?: string }) {
    instances.push(options?.body === undefined ? { title } : { title, body: options.body });
  }
  FakeNotification.permission = permission;
  FakeNotification.requestPermission = vi.fn(async () => permission);
  return { FakeNotification, instances };
}

/**
 * Framework-internal integration bootstrap (house style: framework `__tests__` may
 * import/reuse `coreConfig` directly). Reuses the real system coreConfig — already
 * carrying log/env/runtime as core plugins — and registers `notifyPlugin` as the sole
 * regular plugin, forcing `ctx.runtime` via the loosely-typed `createCore`-level
 * `pluginConfigs` (core-plugin overrides are only reachable at the createCoreConfig/
 * createCore level, never from createApp — see runtime/README.md).
 */
function buildNotifyApp(overrides: { runtime?: Partial<RuntimeConfig> }) {
  const framework = coreConfig.createCore(coreConfig, {
    plugins: [notifyPlugin],
    pluginConfigs: overrides
  });
  return framework.createApp();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("complex tier: notify plugin (integration)", () => {
  describe("forceKind 'web' — the real Notification-API provider", () => {
    beforeEach(() => {
      const { FakeNotification } = createFakeNotificationCtor("granted");
      vi.stubGlobal("Notification", FakeNotification);
    });

    it("full lifecycle: start → isPermissionGranted/requestPermission/show → stop", async () => {
      const app = buildNotifyApp({ runtime: { forceKind: "web" } });
      await app.start();

      const granted = await app.notify.isPermissionGranted();
      expect(granted).toEqual({ ok: true, value: true, provider: "web" });

      const requested = await app.notify.requestPermission();
      expect(requested).toEqual({ ok: true, value: true, provider: "web" });

      const shown = await app.notify.show({ title: "Sync complete", body: "42 items updated" });
      expect(shown).toEqual({ ok: true, value: undefined, provider: "web" });

      await app.stop();
    });

    it("show returns 'denied' without prompting when permission is not granted", async () => {
      vi.unstubAllGlobals();
      const { FakeNotification } = createFakeNotificationCtor("denied");
      vi.stubGlobal("Notification", FakeNotification);
      const app = buildNotifyApp({ runtime: { forceKind: "web" } });
      await app.start();

      const result = await app.notify.show({ title: "Sync complete" });

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "denied",
        message: "notification permission not granted"
      });
      expect(FakeNotification.requestPermission).not.toHaveBeenCalled();

      await app.stop();
    });
  });

  describe("runtime: lifecycle", () => {
    it("API calls before app.start() resolve to 'unavailable'", async () => {
      const app = buildNotifyApp({ runtime: { forceKind: "web" } });

      const result = await app.notify.show({ title: "t" });

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "unavailable",
        message: "app not started — call app.start() first"
      });
    });
  });

  describe("types: API signatures", () => {
    beforeEach(() => {
      const { FakeNotification } = createFakeNotificationCtor("granted");
      vi.stubGlobal("Notification", FakeNotification);
    });

    it("show accepts NotifyOptions and resolves SystemResult<void>", async () => {
      const app = buildNotifyApp({ runtime: { forceKind: "web" } });
      await app.start();

      expectTypeOf(app.notify.show).toBeFunction();
      expectTypeOf(app.notify.show({ title: "t" })).resolves.toEqualTypeOf<SystemResult<void>>();

      await app.stop();
    });

    it("rejects a NotifyOptions missing 'title' at compile time", async () => {
      const app = buildNotifyApp({ runtime: { forceKind: "web" } });

      // @ts-expect-error -- NotifyOptions requires `title`
      await app.notify.show({});

      expect(app).toBeDefined();
    });

    it("narrows SystemResult via the ok discriminant", async () => {
      const app = buildNotifyApp({ runtime: { forceKind: "web" } });
      await app.start();

      const result = await app.notify.isPermissionGranted();
      if (result.ok) {
        expectTypeOf(result.value).toEqualTypeOf<boolean>();
      } else {
        expectTypeOf(result.reason).toEqualTypeOf<SystemErrorReason>();
      }

      await app.stop();
    });
  });
});
