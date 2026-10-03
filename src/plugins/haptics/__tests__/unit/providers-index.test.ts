import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import type { RuntimePlatform } from "../../../runtime/result";
import { loadHapticsProvider } from "../../providers/index";
import { createMockCtx, createVibrate, OK_STATUS } from "./test-helpers";

beforeEach(() => {
  mockImpactFeedback.mockReset().mockResolvedValue(OK_STATUS);
  mockNotificationFeedback.mockReset().mockResolvedValue(OK_STATUS);
  mockSelectionFeedback.mockReset().mockResolvedValue(OK_STATUS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadHapticsProvider — three-way selection", () => {
  it.each<RuntimePlatform>([
    "ios",
    "android"
  ])("kind 'tauri' on %s selects the native provider", async platform => {
    const ctx = createMockCtx({ runtime: { kind: "tauri", platform } });

    const provider = await loadHapticsProvider(ctx)();
    const result = await provider.impact("light");

    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(mockImpactFeedback).toHaveBeenCalledExactlyOnceWith("light");
  });

  it.each<RuntimePlatform>([
    "macos",
    "windows",
    "linux",
    "unknown"
  ])("kind 'tauri' on %s answers 'unsupported' for every method", async platform => {
    const ctx = createMockCtx({ runtime: { kind: "tauri", platform } });

    const provider = await loadHapticsProvider(ctx)();

    const unsupported = { ok: false, provider: "tauri", reason: "unsupported" };
    expect(await provider.impact("heavy")).toEqual(unsupported);
    expect(await provider.notify("success")).toEqual(unsupported);
    expect(await provider.selection()).toEqual(unsupported);
    expect(mockImpactFeedback).not.toHaveBeenCalled();
    expect(mockNotificationFeedback).not.toHaveBeenCalled();
    expect(mockSelectionFeedback).not.toHaveBeenCalled();
  });

  it("kind 'web' with navigator.vibrate selects the web provider", async () => {
    const vibrate = createVibrate();
    vi.stubGlobal("navigator", { vibrate });
    const ctx = createMockCtx({ runtime: { kind: "web", platform: "android" } });

    const provider = await loadHapticsProvider(ctx)();
    const result = await provider.impact("medium");

    expect(result).toEqual({ ok: true, value: undefined, provider: "web" });
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(20);
    expect(mockImpactFeedback).not.toHaveBeenCalled();
  });

  it("kind 'web' without navigator.vibrate answers 'unsupported'", async () => {
    vi.stubGlobal("navigator", {});
    const ctx = createMockCtx({ runtime: { kind: "web", platform: "ios" } });

    const provider = await loadHapticsProvider(ctx)();

    expect(await provider.selection()).toEqual({
      ok: false,
      provider: "web",
      reason: "unsupported"
    });
  });
});
