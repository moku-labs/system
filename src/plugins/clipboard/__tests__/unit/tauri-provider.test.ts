import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadText, mockWriteText } = vi.hoisted(() => ({
  mockReadText: vi.fn(),
  mockWriteText: vi.fn()
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: mockReadText,
  writeText: mockWriteText
}));

import { createTauriClipboardProvider } from "../../providers/tauri";
import { createMockLog } from "./test-helpers";

beforeEach(() => {
  mockReadText.mockReset().mockResolvedValue("clipboard text");
  mockWriteText.mockReset().mockResolvedValue(undefined);
});

describe("createTauriClipboardProvider", () => {
  it("readText returns the clipboard text on success", async () => {
    mockReadText.mockResolvedValue("hello");
    const provider = await createTauriClipboardProvider(createMockLog());

    const result = await provider.readText();

    expect(result).toEqual({ ok: true, value: "hello", provider: "tauri" });
  });

  it("writeText writes the given text", async () => {
    const provider = await createTauriClipboardProvider(createMockLog());

    const result = await provider.writeText("share this");

    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(mockWriteText).toHaveBeenCalledWith("share this");
  });

  it("maps an ACL-style 'not allowed' throw on readText to 'error', NEVER 'denied'", async () => {
    mockReadText.mockRejectedValue(new Error("clipboard-read not allowed"));
    const log = createMockLog();
    const provider = await createTauriClipboardProvider(log);

    const result = await provider.readText();

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "clipboard-read not allowed"
    });
    expect(result.ok ? undefined : result.reason).not.toBe("denied");
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("maps an ACL-style 'not allowed' throw on writeText to 'error', NEVER 'denied'", async () => {
    mockWriteText.mockRejectedValue(new Error("clipboard-write not allowed"));
    const log = createMockLog();
    const provider = await createTauriClipboardProvider(log);

    const result = await provider.writeText("hi");

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "clipboard-write not allowed"
    });
    expect(result.ok ? undefined : result.reason).not.toBe("denied");
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("wraps a non-Error throw into an Error for log.error while still mapping the result", async () => {
    mockReadText.mockRejectedValue("plain string rejection");
    const log = createMockLog();
    const provider = await createTauriClipboardProvider(log);

    const result = await provider.readText();

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
    const provider = await createTauriClipboardProvider(createMockLog());

    await expect(provider.dispose()).resolves.toBeUndefined();
  });
});
