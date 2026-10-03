import { afterEach, describe, expect, it, vi } from "vitest";

import type { HapticsProvider } from "../../providers/types";
import { createWebHapticsProvider } from "../../providers/web";
import type { VibratePattern } from "./test-helpers";
import { createMockLog, createVibrate } from "./test-helpers";

const UNSUPPORTED = { ok: false, provider: "web", reason: "unsupported" };

const CALLS = [
  ["impact", (provider: HapticsProvider) => provider.impact("light")],
  ["notify", (provider: HapticsProvider) => provider.notify("success")],
  ["selection", (provider: HapticsProvider) => provider.selection()]
] as const;

/** Every row of the pattern table in `providers/web.ts`. */
const PATTERN_TABLE: ReadonlyArray<
  readonly [string, VibratePattern, (provider: HapticsProvider) => Promise<unknown>]
> = [
  ["impact light", 10, provider => provider.impact("light")],
  ["impact medium", 20, provider => provider.impact("medium")],
  ["impact heavy", 35, provider => provider.impact("heavy")],
  ["selection", 5, provider => provider.selection()],
  ["notify success", [15, 60, 15], provider => provider.notify("success")],
  ["notify warning", [30, 60, 30], provider => provider.notify("warning")],
  ["notify error", [40, 60, 40, 60, 40], provider => provider.notify("error")]
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createWebHapticsProvider", () => {
  describe("no navigator.vibrate (iOS Safari, WKWebView)", () => {
    it.each(CALLS)("%s resolves 'unsupported'", async (_name, invoke) => {
      vi.stubGlobal("navigator", {});
      const provider = await createWebHapticsProvider(createMockLog());

      expect(await invoke(provider)).toEqual(UNSUPPORTED);
    });

    it("treats a vibrate member that is not a function as unsupported", async () => {
      vi.stubGlobal("navigator", { vibrate: true });
      const provider = await createWebHapticsProvider(createMockLog());

      expect(await provider.impact("heavy")).toEqual(UNSUPPORTED);
    });

    it("resolves 'unsupported' when navigator itself is absent (SSR)", async () => {
      vi.stubGlobal("navigator", undefined);
      const provider = await createWebHapticsProvider(createMockLog());

      expect(await provider.notify("error")).toEqual(UNSUPPORTED);
      await expect(provider.dispose()).resolves.toBeUndefined();
    });
  });

  describe("navigator.vibrate available", () => {
    it.each(PATTERN_TABLE)("%s vibrates %j and resolves ok", async (_name, pattern, invoke) => {
      const vibrate = createVibrate();
      vi.stubGlobal("navigator", { vibrate });
      const provider = await createWebHapticsProvider(createMockLog());

      const result = await invoke(provider);

      expect(result).toEqual({ ok: true, value: undefined, provider: "web" });
      expect(vibrate).toHaveBeenCalledExactlyOnceWith(pattern);
    });

    it("calls vibrate on navigator itself, so a browser never throws 'Illegal invocation'", async () => {
      const host = { vibrate: createVibrate() };
      vi.stubGlobal("navigator", host);
      const provider = await createWebHapticsProvider(createMockLog());

      await provider.selection();

      expect(host.vibrate.mock.contexts[0]).toBe(host);
    });

    it("maps a refused vibrate (false, no user gesture yet) to 'unavailable' without logging", async () => {
      vi.stubGlobal("navigator", { vibrate: createVibrate(false) });
      const log = createMockLog();
      const provider = await createWebHapticsProvider(log);

      const result = await provider.impact("light");

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "unavailable",
        message: "vibrate refused — needs a user gesture first"
      });
      expect(log.error).not.toHaveBeenCalled();
    });

    it("maps a throwing vibrate to 'error' with the raw message and logs it", async () => {
      const vibrate = vi.fn((): boolean => {
        throw new TypeError("vibrate pattern too long");
      });
      vi.stubGlobal("navigator", { vibrate });
      const log = createMockLog();
      const provider = await createWebHapticsProvider(log);

      const result = await provider.notify("warning");

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "error",
        message: "vibrate pattern too long"
      });
      expect(log.error).toHaveBeenCalledExactlyOnceWith(
        "haptics:web-failed",
        { method: "notify" },
        expect.any(Error)
      );
    });

    it("wraps a non-Error throw into an Error for log.error and keeps its text", async () => {
      const vibrate = vi.fn((): boolean => {
        throw "vibration blocked";
      });
      vi.stubGlobal("navigator", { vibrate });
      const log = createMockLog();
      const provider = await createWebHapticsProvider(log);

      const result = await provider.selection();

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "error",
        message: "vibration blocked"
      });
      const loggedError = vi.mocked(log.error).mock.calls[0]?.[2];
      expect(loggedError).toBeInstanceOf(Error);
      expect(loggedError?.message).toBe("vibration blocked");
    });

    it("dispose resolves and does not vibrate", async () => {
      const vibrate = createVibrate();
      vi.stubGlobal("navigator", { vibrate });
      const provider = await createWebHapticsProvider(createMockLog());

      await expect(provider.dispose()).resolves.toBeUndefined();
      expect(vibrate).not.toHaveBeenCalled();
    });
  });
});
