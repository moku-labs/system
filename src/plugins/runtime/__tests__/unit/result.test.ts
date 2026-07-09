import { describe, expect, it } from "vitest";

import { err, mapThrownToResult, ok, unsupportedProvider } from "../../result";

describe("ok", () => {
  it("wraps a value with ok:true and the producing provider", () => {
    expect(ok(42, "web")).toEqual({ ok: true, value: 42, provider: "web" });
  });
});

describe("err", () => {
  it("builds a failure without a message when omitted", () => {
    expect(err("tauri", "unavailable")).toEqual({
      ok: false,
      provider: "tauri",
      reason: "unavailable"
    });
  });

  it("builds a failure with a message when provided", () => {
    expect(err("web", "denied", "blocked")).toEqual({
      ok: false,
      provider: "web",
      reason: "denied",
      message: "blocked"
    });
  });
});

describe("mapThrownToResult", () => {
  it("preserves an Error's message and defaults reason to error", () => {
    const result = mapThrownToResult("web", new Error("boom"));
    expect(result).toEqual({ ok: false, provider: "web", reason: "error", message: "boom" });
  });

  it("preserves a thrown string as the message", () => {
    const result = mapThrownToResult("tauri", "raw failure", "unavailable");
    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "unavailable",
      message: "raw failure"
    });
  });

  it("still produces a message for an unknown thrown shape", () => {
    const result = mapThrownToResult("web", { code: 1 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("error");
    expect(result.message).toBeDefined();
  });

  it("never produces reason 'denied' — even for ambiguous ACL-style errors", () => {
    const result = mapThrownToResult("tauri", new Error("not allowed"));
    expect(result.reason).not.toBe("denied");
  });

  it("defaults reason to 'error' when no reason is passed", () => {
    const result = mapThrownToResult("web", new Error("x"));
    expect(result.reason).toBe("error");
  });

  it("honors an explicit 'unavailable' reason for resolution-path failures", () => {
    const result = mapThrownToResult("web", new Error("x"), "unavailable");
    expect(result.reason).toBe("unavailable");
  });
});

describe("unsupportedProvider", () => {
  it("every listed method resolves to err(provider, 'unsupported')", async () => {
    const provider = unsupportedProvider("web", ["setMenu", "setTooltip"]);
    await expect(provider.setMenu()).resolves.toEqual({
      ok: false,
      provider: "web",
      reason: "unsupported"
    });
    await expect(provider.setTooltip()).resolves.toEqual({
      ok: false,
      provider: "web",
      reason: "unsupported"
    });
  });

  it("exposes a no-op dispose that resolves", async () => {
    const provider = unsupportedProvider("tauri", ["destroy"]);
    await expect(provider.dispose()).resolves.toBeUndefined();
  });
});
