import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

// force-testing rule (runtime README): forcing kind "tauri" MUST be paired with vi.mock of
// the real Tauri module so provider construction never reaches a real IPC call.
const { mockImpactFeedback, mockNotificationFeedback, mockSelectionFeedback } = vi.hoisted(() => ({
  mockImpactFeedback: vi.fn(),
  mockNotificationFeedback: vi.fn(),
  mockSelectionFeedback: vi.fn()
}));

vi.mock("@tauri-apps/plugin-haptics", () => ({
  impactFeedback: mockImpactFeedback,
  notificationFeedback: mockNotificationFeedback,
  selectionFeedback: mockSelectionFeedback
}));

import { coreConfig } from "../../../../config";
import type { SystemResult } from "../../../../index";
import type { RuntimeConfig } from "../../../runtime/types";
import { hapticsPlugin } from "../../index";
import { OK_STATUS } from "../unit/test-helpers";

/**
 * Framework-internal integration bootstrap (house style: framework `__tests__` may reuse
 * `coreConfig`). Registers `hapticsPlugin` as the only regular plugin and forces
 * `ctx.runtime` through the createCore-level `pluginConfigs`.
 */
function buildHapticsApp(overrides: { runtime?: Partial<RuntimeConfig> }) {
  const framework = coreConfig.createCore(coreConfig, {
    plugins: [hapticsPlugin],
    pluginConfigs: overrides
  });
  return framework.createApp();
}

beforeEach(() => {
  mockImpactFeedback.mockReset().mockResolvedValue(OK_STATUS);
  mockNotificationFeedback.mockReset().mockResolvedValue(OK_STATUS);
  mockSelectionFeedback.mockReset().mockResolvedValue(OK_STATUS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("complex tier: haptics plugin (integration)", () => {
  describe("forceKind 'web'", () => {
    it("start → impact('light') without navigator.vibrate → 'unsupported' → stop", async () => {
      vi.stubGlobal("navigator", {});
      const app = buildHapticsApp({ runtime: { forceKind: "web" } });
      await app.start();

      const result = await app.haptics.impact("light");

      expect(result).toEqual({ ok: false, provider: "web", reason: "unsupported" });
      await app.stop();
    });

    it("start → notify('success') with navigator.vibrate plays the success pattern → stop", async () => {
      const vibrate = vi.fn((_pattern: number | readonly number[]): boolean => true);
      vi.stubGlobal("navigator", { vibrate });
      const app = buildHapticsApp({ runtime: { forceKind: "web" } });
      await app.start();

      const result = await app.haptics.notify("success");

      expect(result).toEqual({ ok: true, value: undefined, provider: "web" });
      expect(vibrate).toHaveBeenCalledExactlyOnceWith([15, 60, 15]);
      expect(mockNotificationFeedback).not.toHaveBeenCalled();
      await app.stop();
    });

    it("API calls before app.start() resolve to 'unavailable'", async () => {
      vi.stubGlobal("navigator", {});
      const app = buildHapticsApp({ runtime: { forceKind: "web" } });

      const result = await app.haptics.selection();

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "unavailable",
        message: "app not started — call app.start() first"
      });
    });
  });

  describe("forceKind 'tauri'", () => {
    it("iOS: start → impact('heavy') reaches the native plugin → stop", async () => {
      const app = buildHapticsApp({ runtime: { forceKind: "tauri", forcePlatform: "ios" } });
      await app.start();

      const result = await app.haptics.impact("heavy");

      expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
      expect(mockImpactFeedback).toHaveBeenCalledExactlyOnceWith("heavy");
      await app.stop();
    });

    it("macOS: every method answers 'unsupported' and the native plugin is never called", async () => {
      const app = buildHapticsApp({ runtime: { forceKind: "tauri", forcePlatform: "macos" } });
      await app.start();

      const result = await app.haptics.selection();

      expect(result).toEqual({ ok: false, provider: "tauri", reason: "unsupported" });
      expect(mockSelectionFeedback).not.toHaveBeenCalled();
      await app.stop();
    });
  });

  describe("types: API signatures on app.haptics", () => {
    it("every method resolves SystemResult<void>", () => {
      vi.stubGlobal("navigator", {});
      const app = buildHapticsApp({ runtime: { forceKind: "web" } });

      expectTypeOf(app.haptics.impact).returns.resolves.toEqualTypeOf<SystemResult<void>>();
      expectTypeOf(app.haptics.notify).returns.resolves.toEqualTypeOf<SystemResult<void>>();
      expectTypeOf(app.haptics.selection).returns.resolves.toEqualTypeOf<SystemResult<void>>();
      expect(Object.keys(app.haptics).toSorted()).toEqual(["impact", "notify", "selection"]);
    });

    it("rejects an unknown impact kind at compile time", async () => {
      vi.stubGlobal("navigator", {});
      const app = buildHapticsApp({ runtime: { forceKind: "web" } });

      // @ts-expect-error -- impact takes "light" | "medium" | "heavy"
      const result = await app.haptics.impact("soft");

      expect(result.ok).toBe(false);
    });
  });
});
