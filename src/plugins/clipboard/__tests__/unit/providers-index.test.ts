import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadText, mockWriteText } = vi.hoisted(() => ({
  mockReadText: vi.fn(),
  mockWriteText: vi.fn()
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: mockReadText,
  writeText: mockWriteText
}));

import { loadClipboardProvider } from "../../providers/index";
import type { ClipboardContext } from "../../types";
import { createMockLog } from "./test-helpers";

const createCtx = (runtime: ClipboardContext["runtime"]): ClipboardContext => ({
  config: {},
  // eslint-disable-next-line unicorn/no-null -- ClipboardState.provider is typed `Promise<...> | null` (seam contract)
  state: { provider: null },
  emit: vi.fn(),
  global: {},
  runtime,
  log: createMockLog()
});

beforeEach(() => {
  mockReadText.mockReset().mockResolvedValue("clipboard text");
  mockWriteText.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadClipboardProvider — two-way selection", () => {
  it("kind 'tauri' selects the Tauri clipboard provider", async () => {
    const ctx = createCtx({ kind: "tauri", platform: "macos" });

    const provider = await loadClipboardProvider(ctx)();
    const result = await provider.writeText("hi");

    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(mockWriteText).toHaveBeenCalledWith("hi");
  });

  it("kind 'web' selects the web clipboard provider", async () => {
    const readText = vi.fn(async () => "web value");
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { readText, writeText } });
    const ctx = createCtx({ kind: "web", platform: "unknown" });

    const provider = await loadClipboardProvider(ctx)();
    const result = await provider.readText();

    expect(result).toEqual({ ok: true, value: "web value", provider: "web" });
    expect(mockWriteText).not.toHaveBeenCalled();
  });
});
