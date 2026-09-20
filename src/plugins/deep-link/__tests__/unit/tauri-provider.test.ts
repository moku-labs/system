import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrent, mockOnOpenUrl, mockUnlisten } = vi.hoisted(() => {
  const mockUnlisten = vi.fn();
  const mockOnOpenUrl = vi.fn(async (_handler: (urls: string[]) => void) => mockUnlisten);
  // eslint-disable-next-line unicorn/no-null -- default mock: no launch URLs reported
  const mockGetCurrent = vi.fn(async () => null as string[] | null);
  return { mockGetCurrent, mockOnOpenUrl, mockUnlisten };
});

vi.mock("@tauri-apps/plugin-deep-link", () => ({
  getCurrent: mockGetCurrent,
  onOpenUrl: mockOnOpenUrl
}));

import { createTauriDeepLinkProvider } from "../../providers/tauri";
import { createMockLog } from "./test-helpers";

beforeEach(() => {
  mockGetCurrent.mockClear();
  // eslint-disable-next-line unicorn/no-null -- default mock: no launch URLs reported
  mockGetCurrent.mockImplementation(async () => null);
  mockOnOpenUrl.mockClear();
  mockOnOpenUrl.mockImplementation(async () => mockUnlisten);
  mockUnlisten.mockClear();
});

describe("createTauriDeepLinkProvider", () => {
  it("registers onOpenUrl at factory time", async () => {
    await createTauriDeepLinkProvider({ schemes: [] }, createMockLog(), vi.fn());

    expect(mockOnOpenUrl).toHaveBeenCalledTimes(1);
  });

  it("forwards every delivered URL to onUrl", async () => {
    const onUrl = vi.fn();
    await createTauriDeepLinkProvider({ schemes: [] }, createMockLog(), onUrl);

    const handler = mockOnOpenUrl.mock.calls[0]?.[0];
    handler?.(["myapp://a", "myapp://b"]);

    expect(onUrl).toHaveBeenNthCalledWith(1, "myapp://a");
    expect(onUrl).toHaveBeenNthCalledWith(2, "myapp://b");
  });

  it("dispose calls the unlisten function returned by onOpenUrl", async () => {
    const provider = await createTauriDeepLinkProvider({ schemes: [] }, createMockLog(), vi.fn());

    await provider.dispose();

    expect(mockUnlisten).toHaveBeenCalledTimes(1);
  });

  it("getCurrent returns ok(null) when the plugin reports no URLs", async () => {
    // eslint-disable-next-line unicorn/no-null -- the mocked Tauri plugin's documented "no URLs" return value
    mockGetCurrent.mockResolvedValue(null);
    const provider = await createTauriDeepLinkProvider({ schemes: [] }, createMockLog(), vi.fn());

    const result = await provider.getCurrent();

    // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — no launch URL
    expect(result).toEqual({ ok: true, value: null, provider: "tauri" });
  });

  it("getCurrent returns ok with the first URL when the plugin reports one or more", async () => {
    mockGetCurrent.mockResolvedValue(["myapp://open", "myapp://second"]);
    const provider = await createTauriDeepLinkProvider({ schemes: [] }, createMockLog(), vi.fn());

    const result = await provider.getCurrent();

    expect(result).toEqual({ ok: true, value: "myapp://open", provider: "tauri" });
  });

  it("getCurrent forwards the launch URLs past the first through onUrl instead of dropping them", async () => {
    mockGetCurrent.mockResolvedValue(["myapp://open", "myapp://second", "myapp://third"]);
    const onUrl = vi.fn();
    const provider = await createTauriDeepLinkProvider({ schemes: [] }, createMockLog(), onUrl);

    await provider.getCurrent();

    expect(onUrl).toHaveBeenNthCalledWith(1, "myapp://second");
    expect(onUrl).toHaveBeenNthCalledWith(2, "myapp://third");
  });

  it("getCurrent forwards the extra launch URLs once, not again on a second call", async () => {
    mockGetCurrent.mockResolvedValue(["myapp://open", "myapp://second"]);
    const onUrl = vi.fn();
    const provider = await createTauriDeepLinkProvider({ schemes: [] }, createMockLog(), onUrl);

    await provider.getCurrent();
    await provider.getCurrent();

    expect(onUrl).toHaveBeenCalledTimes(1);
  });

  it("getCurrent forwards nothing when the plugin reports a single launch URL", async () => {
    mockGetCurrent.mockResolvedValue(["myapp://open"]);
    const onUrl = vi.fn();
    const provider = await createTauriDeepLinkProvider({ schemes: [] }, createMockLog(), onUrl);

    await provider.getCurrent();

    expect(onUrl).not.toHaveBeenCalled();
  });

  it("getCurrent throw maps to reason 'error' with the message preserved, never 'denied'", async () => {
    mockGetCurrent.mockRejectedValue(new Error("plugin not registered"));
    const log = createMockLog();
    const provider = await createTauriDeepLinkProvider({ schemes: [] }, log, vi.fn());

    const result = await provider.getCurrent();

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "plugin not registered"
    });
    expect(result.ok ? undefined : result.reason).not.toBe("denied");
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("wraps a non-Error getCurrent throw into an Error for log.error while still mapping the result", async () => {
    mockGetCurrent.mockRejectedValue("plain string rejection");
    const log = createMockLog();
    const provider = await createTauriDeepLinkProvider({ schemes: [] }, log, vi.fn());

    const result = await provider.getCurrent();

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

  it("answers getCurrent with 'app stopped' once disposed instead of reaching the plugin again", async () => {
    const onUrl = vi.fn();
    mockGetCurrent.mockResolvedValue(["myapp://a", "myapp://b"]);
    const provider = await createTauriDeepLinkProvider({ schemes: [] }, createMockLog(), onUrl);
    await provider.dispose();

    const result = await provider.getCurrent();

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "unavailable",
      message: "app stopped"
    });
    expect(mockGetCurrent).not.toHaveBeenCalled();
    expect(onUrl).not.toHaveBeenCalled();
  });

  it("dispose is idempotent — the OS listener is unregistered exactly once", async () => {
    const provider = await createTauriDeepLinkProvider({ schemes: [] }, createMockLog(), vi.fn());

    await provider.dispose();
    await provider.dispose();

    expect(mockUnlisten).toHaveBeenCalledTimes(1);
  });

  it("propagates a factory-time (onOpenUrl) throw so it can be folded to 'unavailable' by startResolution", async () => {
    mockOnOpenUrl.mockRejectedValueOnce(new Error("listener registration failed"));

    await expect(
      createTauriDeepLinkProvider({ schemes: [] }, createMockLog(), vi.fn())
    ).rejects.toThrow("listener registration failed");
  });
});
