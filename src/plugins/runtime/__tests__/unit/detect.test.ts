import { afterEach, describe, expect, it, vi } from "vitest";

import { detectKind, detectPlatform } from "../../detect";

describe("detectKind", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns tauri when __TAURI_INTERNALS__ is present on globalThis", () => {
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    expect(detectKind()).toBe("tauri");
  });

  it("returns web when __TAURI_INTERNALS__ is absent", () => {
    expect(detectKind()).toBe("web");
  });

  it("returns tauri when the shell sets globalThis.isTauri to true", () => {
    vi.stubGlobal("isTauri", true);
    expect(detectKind()).toBe("tauri");
  });

  it("ignores an isTauri value that is not exactly true", () => {
    vi.stubGlobal("isTauri", "yes");
    expect(detectKind()).toBe("web");
  });
});

describe("detectPlatform", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns unknown when navigator is undefined (SSR path)", () => {
    vi.stubGlobal("navigator", undefined);
    expect(detectPlatform()).toBe("unknown");
  });

  it.each([
    [
      "macos",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)"
    ],
    ["windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"],
    ["linux", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)"],
    [
      "ios",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)"
    ],
    ["android", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko)"]
  ])("returns %s for a matching user agent", (expected, userAgent) => {
    vi.stubGlobal("navigator", { userAgent });
    expect(detectPlatform()).toBe(expected);
  });

  it("returns unknown for an unrecognized user agent", () => {
    vi.stubGlobal("navigator", { userAgent: "SomeExoticBot/1.0" });
    expect(detectPlatform()).toBe("unknown");
  });

  it("returns ios for a Macintosh user agent reporting touch points (iPadOS desktop mode)", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
      maxTouchPoints: 5
    });
    expect(detectPlatform()).toBe("ios");
  });

  it("keeps macos for a Macintosh user agent with no touch points", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
      maxTouchPoints: 0
    });
    expect(detectPlatform()).toBe("macos");
  });
});
