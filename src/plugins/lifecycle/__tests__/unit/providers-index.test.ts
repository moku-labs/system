import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockListen } = vi.hoisted(() => ({
  mockListen: vi.fn(async (_event: string, _handler: () => void) => vi.fn())
}));

vi.mock("@tauri-apps/api/event", () => ({ listen: mockListen }));

import type { RuntimePlatform } from "../../../runtime/result";
import { loadLifecycleProvider } from "../../providers/index";
import { createFakeDocument, createMockCtx } from "./test-helpers";

beforeEach(() => {
  mockListen.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadLifecycleProvider", () => {
  it.each<RuntimePlatform>([
    "ios",
    "android",
    "macos",
    "windows",
    "linux",
    "unknown"
  ])("kind 'tauri' on %s → the Tauri provider: native events plus visibility", async platform => {
    const doc = createFakeDocument();
    vi.stubGlobal("document", doc);
    const ctx = createMockCtx({ runtime: { kind: "tauri", platform } });

    const provider = await loadLifecycleProvider(ctx, vi.fn())();

    expect(mockListen).toHaveBeenCalledTimes(2);
    expect(doc.listenerCount()).toBe(1);
    await provider.dispose();
  });

  it("kind 'web' → the web provider; the native events are never touched", async () => {
    const doc = createFakeDocument();
    vi.stubGlobal("document", doc);
    const ctx = createMockCtx({ runtime: { kind: "web", platform: "macos" } });

    const provider = await loadLifecycleProvider(ctx, vi.fn())();

    expect(mockListen).not.toHaveBeenCalled();
    expect(doc.listenerCount()).toBe(1);
    await provider.dispose();
  });

  it("hands the signal to the provider: a page hidden at resolution reports pause", async () => {
    vi.stubGlobal("document", createFakeDocument("hidden"));
    const signal = vi.fn();

    await loadLifecycleProvider(createMockCtx(), signal)();

    expect(signal).toHaveBeenCalledWith("pause");
  });

  it("the Tauri provider warns through ctx.log", async () => {
    mockListen.mockRejectedValueOnce(new Error("not allowed"));
    const ctx = createMockCtx({ runtime: { kind: "tauri", platform: "android" } });

    await loadLifecycleProvider(ctx, vi.fn())();

    expect(ctx.log.warn).toHaveBeenCalledWith("lifecycle:tauri-events-unavailable", {
      message: "not allowed"
    });
  });
});
