import { afterEach, describe, expect, it, vi } from "vitest";

import { createWebClipboardProvider } from "../../providers/web";
import { createMockLog } from "./test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createWebClipboardProvider", () => {
  describe("no navigator.clipboard (insecure context / SSR-ish)", () => {
    it("readText and writeText both resolve to 'unsupported'", async () => {
      vi.stubGlobal("navigator", {});
      const provider = await createWebClipboardProvider(createMockLog());

      expect(await provider.readText()).toEqual({
        ok: false,
        provider: "web",
        reason: "unsupported"
      });
      expect(await provider.writeText("x")).toEqual({
        ok: false,
        provider: "web",
        reason: "unsupported"
      });
    });

    it("dispose is a no-op that resolves", async () => {
      vi.stubGlobal("navigator", {});
      const provider = await createWebClipboardProvider(createMockLog());

      await expect(provider.dispose()).resolves.toBeUndefined();
    });
  });

  describe("navigator itself is absent (SSR)", () => {
    it("readText and writeText both resolve to 'unsupported'", async () => {
      vi.stubGlobal("navigator", undefined);
      const provider = await createWebClipboardProvider(createMockLog());

      expect(await provider.readText()).toEqual({
        ok: false,
        provider: "web",
        reason: "unsupported"
      });
      expect(await provider.writeText("x")).toEqual({
        ok: false,
        provider: "web",
        reason: "unsupported"
      });
    });
  });

  describe("navigator.clipboard.readText missing (e.g. Firefox)", () => {
    it("readText resolves 'unsupported' while writeText still works", async () => {
      const writeText = vi.fn(async () => undefined);
      vi.stubGlobal("navigator", { clipboard: { writeText } });
      const provider = await createWebClipboardProvider(createMockLog());

      const readResult = await provider.readText();
      expect(readResult).toEqual({ ok: false, provider: "web", reason: "unsupported" });

      const writeResult = await provider.writeText("hello");
      expect(writeResult).toEqual({ ok: true, value: undefined, provider: "web" });
      expect(writeText).toHaveBeenCalledWith("hello");
    });
  });

  describe("navigator.clipboard.writeText missing", () => {
    it("writeText resolves 'unsupported' while readText still works", async () => {
      const readText = vi.fn(async () => "clipboard value");
      vi.stubGlobal("navigator", { clipboard: { readText } });
      const provider = await createWebClipboardProvider(createMockLog());

      const writeResult = await provider.writeText("hello");
      expect(writeResult).toEqual({ ok: false, provider: "web", reason: "unsupported" });

      const readResult = await provider.readText();
      expect(readResult).toEqual({ ok: true, value: "clipboard value", provider: "web" });
      expect(readText).toHaveBeenCalledWith();
    });
  });

  describe("full navigator.clipboard support", () => {
    it("readText returns the clipboard text on success", async () => {
      const readText = vi.fn(async () => "copied value");
      const writeText = vi.fn(async () => undefined);
      vi.stubGlobal("navigator", { clipboard: { readText, writeText } });
      const provider = await createWebClipboardProvider(createMockLog());

      const result = await provider.readText();

      expect(result).toEqual({ ok: true, value: "copied value", provider: "web" });
    });

    it("writeText writes the given text on success", async () => {
      const readText = vi.fn(async () => "");
      const writeText = vi.fn(async () => undefined);
      vi.stubGlobal("navigator", { clipboard: { readText, writeText } });
      const provider = await createWebClipboardProvider(createMockLog());

      const result = await provider.writeText("share this");

      expect(result).toEqual({ ok: true, value: undefined, provider: "web" });
      expect(writeText).toHaveBeenCalledWith("share this");
    });

    it("a thrown NotAllowedError DOMException maps readText to 'denied'", async () => {
      const readText = vi.fn(async () => {
        throw new DOMException("Permission denied", "NotAllowedError");
      });
      const writeText = vi.fn(async () => undefined);
      vi.stubGlobal("navigator", { clipboard: { readText, writeText } });
      const provider = await createWebClipboardProvider(createMockLog());

      const result = await provider.readText();

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "denied",
        message: "Permission denied"
      });
    });

    it("a thrown NotAllowedError DOMException maps writeText to 'denied'", async () => {
      const readText = vi.fn(async () => "");
      const writeText = vi.fn(async () => {
        throw new DOMException("Permission denied", "NotAllowedError");
      });
      vi.stubGlobal("navigator", { clipboard: { readText, writeText } });
      const provider = await createWebClipboardProvider(createMockLog());

      const result = await provider.writeText("hi");

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "denied",
        message: "Permission denied"
      });
    });

    it("a generic throw on readText maps to 'error' and logs it", async () => {
      const readText = vi.fn(async () => {
        throw new Error("boom");
      });
      const writeText = vi.fn(async () => undefined);
      vi.stubGlobal("navigator", { clipboard: { readText, writeText } });
      const log = createMockLog();
      const provider = await createWebClipboardProvider(log);

      const result = await provider.readText();

      expect(result).toEqual({ ok: false, provider: "web", reason: "error", message: "boom" });
      expect(log.error).toHaveBeenCalledTimes(1);
    });

    it("a generic throw on writeText maps to 'error' and logs it", async () => {
      const readText = vi.fn(async () => "");
      const writeText = vi.fn(async () => {
        throw new Error("boom");
      });
      vi.stubGlobal("navigator", { clipboard: { readText, writeText } });
      const log = createMockLog();
      const provider = await createWebClipboardProvider(log);

      const result = await provider.writeText("hi");

      expect(result).toEqual({ ok: false, provider: "web", reason: "error", message: "boom" });
      expect(log.error).toHaveBeenCalledTimes(1);
    });

    it("wraps a non-Error throw into an Error for log.error while still mapping the result", async () => {
      const readText = vi.fn(async () => {
        throw "plain string rejection";
      });
      const writeText = vi.fn(async () => undefined);
      vi.stubGlobal("navigator", { clipboard: { readText, writeText } });
      const log = createMockLog();
      const provider = await createWebClipboardProvider(log);

      const result = await provider.readText();

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "error",
        message: "plain string rejection"
      });
      const loggedError = vi.mocked(log.error).mock.calls[0]?.[2];
      expect(loggedError).toBeInstanceOf(Error);
      expect(loggedError?.message).toBe("plain string rejection");
    });

    it("dispose is a no-op that resolves", async () => {
      const readText = vi.fn(async () => "");
      const writeText = vi.fn(async () => undefined);
      vi.stubGlobal("navigator", { clipboard: { readText, writeText } });
      const provider = await createWebClipboardProvider(createMockLog());

      await expect(provider.dispose()).resolves.toBeUndefined();
    });
  });
});
