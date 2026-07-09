/* eslint-disable unicorn/no-null -- RuntimeConfig.forceKind/forcePlatform are typed `X | null`
   auto-detect sentinels per the seam contract (spec/01-runtime.md); tests exercise both states. */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../detect", () => ({
  detectKind: vi.fn(() => "web"),
  detectPlatform: vi.fn(() => "macos")
}));

import { detectKind, detectPlatform } from "../../detect";
import { runtimePlugin } from "../../index";

describe("runtimePlugin config", () => {
  it("defaults both forceKind and forcePlatform to null (auto-detect)", () => {
    expect(runtimePlugin.spec.config).toEqual({ forceKind: null, forcePlatform: null });
  });
});

describe("runtimePlugin createState", () => {
  it("detects kind/platform when both overrides are null", () => {
    const state = runtimePlugin.spec.createState?.({
      config: { forceKind: null, forcePlatform: null }
    });
    expect(state).toEqual({ kind: "web", platform: "macos" });
    expect(detectKind).toHaveBeenCalled();
    expect(detectPlatform).toHaveBeenCalled();
  });

  it("skips detection entirely when both overrides are forced", () => {
    vi.clearAllMocks();
    const state = runtimePlugin.spec.createState?.({
      config: { forceKind: "tauri", forcePlatform: "ios" }
    });
    expect(state).toEqual({ kind: "tauri", platform: "ios" });
    expect(detectKind).not.toHaveBeenCalled();
    expect(detectPlatform).not.toHaveBeenCalled();
  });
});

describe("runtimePlugin api", () => {
  it("returns kind/platform copied from state as data properties", () => {
    const state = { kind: "web" as const, platform: "linux" as const };
    const api = runtimePlugin.spec.api?.({
      config: { forceKind: null, forcePlatform: null },
      state
    });
    expect(api).toEqual({ kind: "web", platform: "linux" });
  });
});
