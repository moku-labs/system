import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

// No vi.mock of any `@tauri-apps/*` module here, even for forceKind "tauri": keepAwake has no
// Tauri provider and imports nothing native (D-S03). Both kinds run on navigator.wakeLock.
import { coreConfig } from "../../../../config";
import type { SystemErrorReason, SystemResult } from "../../../../index";
import type { RuntimeConfig } from "../../../runtime/types";
import { keepAwakePlugin } from "../../index";
import { changeVisibility, flushAsync, installWakeLock } from "../unit/test-helpers";

/**
 * Framework-internal integration bootstrap (house style: framework `__tests__` may reuse
 * `coreConfig`). Registers `keepAwakePlugin` as the only regular plugin and forces
 * `ctx.runtime` through the `createCore`-level `pluginConfigs`.
 */
function buildKeepAwakeApp(overrides: { runtime?: Partial<RuntimeConfig> }) {
  const framework = coreConfig.createCore(coreConfig, {
    plugins: [keepAwakePlugin],
    pluginConfigs: overrides
  });
  return framework.createApp();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("complex tier: keepAwake plugin (integration)", () => {
  describe("forceKind 'web' — full lifecycle over navigator.wakeLock", () => {
    it("start → set(true) → ok → stop → the lock is released and the listener removed", async () => {
      const { wakeLock, fakeDocument } = installWakeLock();
      const app = buildKeepAwakeApp({ runtime: { forceKind: "web" } });
      await app.start();

      const result = await app.keepAwake.set(true);
      expect(result).toEqual({ ok: true, value: undefined, provider: "web" });
      expect(wakeLock.request).toHaveBeenCalledExactlyOnceWith("screen");

      await app.stop();

      expect(wakeLock.sentinels[0]?.release).toHaveBeenCalledTimes(1);
      expect(fakeDocument.listeners.size).toBe(0);
    });

    it("re-acquires after the page comes back, and stops doing so after app.stop()", async () => {
      const { wakeLock, fakeDocument } = installWakeLock();
      const app = buildKeepAwakeApp({ runtime: { forceKind: "web" } });
      await app.start();

      await app.keepAwake.set(true);
      wakeLock.sentinels[0]?.drop();
      changeVisibility(fakeDocument, "hidden");
      changeVisibility(fakeDocument, "visible");
      await flushAsync();
      expect(wakeLock.request).toHaveBeenCalledTimes(2);

      await app.stop();
      changeVisibility(fakeDocument, "hidden");
      changeVisibility(fakeDocument, "visible");
      await flushAsync();
      expect(wakeLock.request).toHaveBeenCalledTimes(2);
    });

    it("set(true) answers 'unavailable' before app.start()", async () => {
      installWakeLock();
      const app = buildKeepAwakeApp({ runtime: { forceKind: "web" } });

      const result = await app.keepAwake.set(true);

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "unavailable",
        message: "app not started — call app.start() first"
      });
    });

    it("set(true) answers 'unavailable' after app.stop()", async () => {
      installWakeLock();
      const app = buildKeepAwakeApp({ runtime: { forceKind: "web" } });
      await app.start();
      await app.keepAwake.set(false);
      await app.stop();

      const result = await app.keepAwake.set(true);

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "unavailable",
        message: "app stopped"
      });
    });

    it("a NotAllowedError surfaces as a typed 'denied' failure", async () => {
      const { wakeLock } = installWakeLock();
      wakeLock.request.mockRejectedValueOnce(
        Object.assign(new Error("Battery saver is on"), { name: "NotAllowedError" })
      );
      const app = buildKeepAwakeApp({ runtime: { forceKind: "web" } });
      await app.start();

      const result = await app.keepAwake.set(true);

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "denied",
        message: "Battery saver is on"
      });

      await app.stop();
    });

    it("no navigator.wakeLock → 'unsupported'", async () => {
      vi.stubGlobal("navigator", {});
      const app = buildKeepAwakeApp({ runtime: { forceKind: "web" } });
      await app.start();

      const result = await app.keepAwake.set(true);

      expect(result).toEqual({ ok: false, provider: "web", reason: "unsupported" });

      await app.stop();
    });
  });

  describe("forceKind 'tauri' — the same webview lock, nothing native imported", () => {
    it("start → set(true) → ok tagged 'tauri' → stop → released", async () => {
      const { wakeLock } = installWakeLock();
      const app = buildKeepAwakeApp({
        runtime: { forceKind: "tauri", forcePlatform: "android" }
      });
      await app.start();

      const result = await app.keepAwake.set(true);
      expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });

      await app.stop();
      expect(wakeLock.sentinels[0]?.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("types: API signature", () => {
    it("set takes a boolean and resolves SystemResult<void>", () => {
      vi.stubGlobal("navigator", {});
      const app = buildKeepAwakeApp({ runtime: { forceKind: "web" } });

      expectTypeOf(app.keepAwake.set).parameter(0).toEqualTypeOf<boolean>();
      expectTypeOf(app.keepAwake.set).returns.resolves.toEqualTypeOf<SystemResult<void>>();
    });

    it("rejects a non-boolean argument at compile time", async () => {
      vi.stubGlobal("navigator", {});
      const app = buildKeepAwakeApp({ runtime: { forceKind: "web" } });

      // @ts-expect-error -- set requires a boolean, not a string
      const result = await app.keepAwake.set("on");

      expect(result.ok).toBe(false);
    });

    it("narrows SystemResult through the ok discriminant", async () => {
      installWakeLock();
      const app = buildKeepAwakeApp({ runtime: { forceKind: "web" } });
      await app.start();

      const result = await app.keepAwake.set(true);
      if (result.ok) {
        expectTypeOf(result.value).toEqualTypeOf<void>();
      } else {
        expectTypeOf(result.reason).toEqualTypeOf<SystemErrorReason>();
      }

      await app.stop();
    });
  });
});
