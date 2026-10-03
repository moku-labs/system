import { afterEach, describe, expect, it, vi } from "vitest";

import type { RuntimeKind } from "../../../runtime/result";
import { createWakeLockProvider } from "../../providers/wake-lock";
import type { FakeSentinel } from "./test-helpers";
import {
  changeVisibility,
  createFakeSentinel,
  createMockLog,
  flushAsync,
  installWakeLock
} from "./test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each<RuntimeKind>(["web", "tauri"])("createWakeLockProvider(%s)", kind => {
  const done = { ok: true, value: undefined, provider: kind };

  describe("Screen Wake Lock API missing → the unsupported stand-in", () => {
    it.each([
      ["navigator is absent (SSR)", undefined],
      ["navigator has no wakeLock", {}],
      ["wakeLock has no request()", { wakeLock: {} }]
    ])("%s: set answers 'unsupported' tagged with the kind", async (_label, fakeNavigator) => {
      vi.stubGlobal("navigator", fakeNavigator);
      const provider = createWakeLockProvider(kind, createMockLog());

      expect(await provider.set(true)).toEqual({
        ok: false,
        provider: kind,
        reason: "unsupported"
      });
      expect(await provider.set(false)).toEqual({
        ok: false,
        provider: kind,
        reason: "unsupported"
      });
      await expect(provider.dispose()).resolves.toBeUndefined();
    });
  });

  describe("set(true)", () => {
    it("requests a screen lock and answers ok tagged with the kind", async () => {
      const { wakeLock } = installWakeLock();
      const provider = createWakeLockProvider(kind, createMockLog());

      const result = await provider.set(true);

      expect(result).toEqual(done);
      expect(wakeLock.request).toHaveBeenCalledExactlyOnceWith("screen");
    });

    it("answers ok without a second request while the lock is held", async () => {
      const { wakeLock } = installWakeLock();
      const provider = createWakeLockProvider(kind, createMockLog());

      await provider.set(true);
      const result = await provider.set(true);

      expect(result).toEqual(done);
      expect(wakeLock.request).toHaveBeenCalledTimes(1);
    });

    it("shares one in-flight request between two calls", async () => {
      const { wakeLock } = installWakeLock();
      const provider = createWakeLockProvider(kind, createMockLog());

      const results = await Promise.all([provider.set(true), provider.set(true)]);

      expect(results).toEqual([done, done]);
      expect(wakeLock.request).toHaveBeenCalledTimes(1);
    });

    it("answers 'unavailable' on a hidden page and takes the lock once the page is visible", async () => {
      const { wakeLock, fakeDocument } = installWakeLock("hidden");
      const provider = createWakeLockProvider(kind, createMockLog());

      const hidden = await provider.set(true);

      expect(hidden).toEqual({
        ok: false,
        provider: kind,
        reason: "unavailable",
        message: "page hidden — re-acquired when visible"
      });
      expect(wakeLock.request).not.toHaveBeenCalled();

      changeVisibility(fakeDocument, "visible");
      await flushAsync();

      expect(wakeLock.request).toHaveBeenCalledTimes(1);
      expect(await provider.set(true)).toEqual(done);
      expect(wakeLock.request).toHaveBeenCalledTimes(1);
    });

    it("maps a NotAllowedError to 'denied' with the browser's message and logs no error", async () => {
      const { wakeLock } = installWakeLock();
      wakeLock.request.mockRejectedValueOnce(
        Object.assign(new Error("Battery saver is on"), { name: "NotAllowedError" })
      );
      const log = createMockLog();
      const provider = createWakeLockProvider(kind, log);

      const result = await provider.set(true);

      expect(result).toEqual({
        ok: false,
        provider: kind,
        reason: "denied",
        message: "Battery saver is on"
      });
      expect(log.error).not.toHaveBeenCalled();
    });

    it("maps a plain-object NotAllowedError without a message to 'denied'", async () => {
      const { wakeLock } = installWakeLock();
      wakeLock.request.mockRejectedValueOnce({ name: "NotAllowedError" });
      const provider = createWakeLockProvider(kind, createMockLog());

      const result = await provider.set(true);

      expect(result).toEqual({ ok: false, provider: kind, reason: "denied" });
    });

    it("maps any other throw to 'error' and logs keepAwake:request-failed", async () => {
      const { wakeLock } = installWakeLock();
      wakeLock.request.mockRejectedValueOnce(new Error("boom"));
      const log = createMockLog();
      const provider = createWakeLockProvider(kind, log);

      const result = await provider.set(true);

      expect(result).toEqual({ ok: false, provider: kind, reason: "error", message: "boom" });
      expect(log.error).toHaveBeenCalledExactlyOnceWith(
        "keepAwake:request-failed",
        undefined,
        expect.any(Error)
      );
    });

    it("wraps a non-Error throw into an Error for the log while keeping the message", async () => {
      const { wakeLock } = installWakeLock();
      wakeLock.request.mockRejectedValueOnce("plain string rejection");
      const log = createMockLog();
      const provider = createWakeLockProvider(kind, log);

      const result = await provider.set(true);

      expect(result).toEqual({
        ok: false,
        provider: kind,
        reason: "error",
        message: "plain string rejection"
      });
      const loggedError = vi.mocked(log.error).mock.calls[0]?.[2];
      expect(loggedError).toBeInstanceOf(Error);
      expect(loggedError?.message).toBe("plain string rejection");
    });

    it("does not cache a failed request: the next set(true) asks again", async () => {
      const { wakeLock } = installWakeLock();
      wakeLock.request.mockRejectedValueOnce(new Error("boom"));
      const provider = createWakeLockProvider(kind, createMockLog());

      await provider.set(true);
      const retry = await provider.set(true);

      expect(retry).toEqual(done);
      expect(wakeLock.request).toHaveBeenCalledTimes(2);
    });
  });

  describe("the browser drops the lock", () => {
    it("a 'release' event clears the held lock, so the next set(true) requests again", async () => {
      const { wakeLock } = installWakeLock();
      const provider = createWakeLockProvider(kind, createMockLog());

      await provider.set(true);
      wakeLock.sentinels[0]?.drop();
      const result = await provider.set(true);

      expect(result).toEqual(done);
      expect(wakeLock.request).toHaveBeenCalledTimes(2);
    });

    it("hiding the page neither requests nor releases by itself", async () => {
      const { wakeLock, fakeDocument } = installWakeLock();
      const provider = createWakeLockProvider(kind, createMockLog());

      await provider.set(true);
      changeVisibility(fakeDocument, "hidden");
      await flushAsync();

      expect(wakeLock.request).toHaveBeenCalledTimes(1);
      expect(wakeLock.sentinels[0]?.release).not.toHaveBeenCalled();
    });

    it("a visible page re-acquires a dropped lock once", async () => {
      const { wakeLock, fakeDocument } = installWakeLock();
      const provider = createWakeLockProvider(kind, createMockLog());

      await provider.set(true);
      wakeLock.sentinels[0]?.drop();
      changeVisibility(fakeDocument, "hidden");
      changeVisibility(fakeDocument, "visible");
      await flushAsync();

      expect(wakeLock.request).toHaveBeenCalledTimes(2);

      changeVisibility(fakeDocument, "visible");
      await flushAsync();

      expect(wakeLock.request).toHaveBeenCalledTimes(2);
    });

    it("two visibility events in one tick re-acquire through one request", async () => {
      const { wakeLock, fakeDocument } = installWakeLock();
      const provider = createWakeLockProvider(kind, createMockLog());

      await provider.set(true);
      wakeLock.sentinels[0]?.drop();
      changeVisibility(fakeDocument, "visible");
      changeVisibility(fakeDocument, "visible");
      await flushAsync();

      expect(wakeLock.request).toHaveBeenCalledTimes(2);
    });

    it("a visible page does not re-acquire after set(false)", async () => {
      const { wakeLock, fakeDocument } = installWakeLock();
      const provider = createWakeLockProvider(kind, createMockLog());

      await provider.set(true);
      await provider.set(false);
      changeVisibility(fakeDocument, "hidden");
      changeVisibility(fakeDocument, "visible");
      await flushAsync();

      expect(wakeLock.request).toHaveBeenCalledTimes(1);
    });

    it("a failed re-acquire is logged at warn and never thrown", async () => {
      const { wakeLock, fakeDocument } = installWakeLock();
      const log = createMockLog();
      const provider = createWakeLockProvider(kind, log);

      await provider.set(true);
      wakeLock.sentinels[0]?.drop();
      wakeLock.request.mockRejectedValueOnce(new Error("boom"));
      changeVisibility(fakeDocument, "visible");
      await flushAsync();

      expect(log.warn).toHaveBeenCalledExactlyOnceWith("keepAwake:reacquire-failed", {
        reason: "error",
        message: "boom"
      });
    });

    it("a late 'release' event from an old lock does not clear the newer one", async () => {
      const { wakeLock } = installWakeLock();
      const stale = createFakeSentinel();
      // Released by the provider, but its "release" event only fires later.
      stale.release.mockResolvedValueOnce(undefined);
      wakeLock.request.mockResolvedValueOnce(stale);
      const provider = createWakeLockProvider(kind, createMockLog());

      await provider.set(true);
      await provider.set(false);
      await provider.set(true);
      stale.drop();
      const result = await provider.set(true);

      expect(result).toEqual(done);
      expect(wakeLock.request).toHaveBeenCalledTimes(2);
    });
  });

  describe("set(false)", () => {
    it("releases the held lock and answers ok", async () => {
      const { wakeLock } = installWakeLock();
      const provider = createWakeLockProvider(kind, createMockLog());

      await provider.set(true);
      const result = await provider.set(false);

      expect(result).toEqual(done);
      expect(wakeLock.sentinels[0]?.release).toHaveBeenCalledTimes(1);
    });

    it("answers ok when nothing is held", async () => {
      const { wakeLock } = installWakeLock();
      const provider = createWakeLockProvider(kind, createMockLog());

      const result = await provider.set(false);

      expect(result).toEqual(done);
      expect(wakeLock.request).not.toHaveBeenCalled();
    });

    it("swallows a release() rejection, logs it and still answers ok", async () => {
      const { wakeLock } = installWakeLock();
      const sentinel = createFakeSentinel();
      sentinel.release.mockRejectedValueOnce(new Error("already released"));
      wakeLock.request.mockResolvedValueOnce(sentinel);
      const log = createMockLog();
      const provider = createWakeLockProvider(kind, log);

      await provider.set(true);
      const result = await provider.set(false);

      expect(result).toEqual(done);
      expect(log.error).toHaveBeenCalledExactlyOnceWith(
        "keepAwake:release-failed",
        undefined,
        expect.any(Error)
      );
    });

    it("releases a lock that arrives after the wish was dropped", async () => {
      const { wakeLock } = installWakeLock();
      const arriving = Promise.withResolvers<FakeSentinel>();
      wakeLock.request.mockReturnValueOnce(arriving.promise);
      const provider = createWakeLockProvider(kind, createMockLog());

      const holding = provider.set(true);
      expect(await provider.set(false)).toEqual(done);
      const sentinel = createFakeSentinel();
      arriving.resolve(sentinel);

      expect(await holding).toEqual(done);
      expect(sentinel.release).toHaveBeenCalledTimes(1);
    });

    it("keeps the lock when set(true) follows set(false) while one request is in flight", async () => {
      const { wakeLock } = installWakeLock();
      const arriving = Promise.withResolvers<FakeSentinel>();
      wakeLock.request.mockReturnValueOnce(arriving.promise);
      const provider = createWakeLockProvider(kind, createMockLog());

      const first = provider.set(true);
      await provider.set(false);
      const second = provider.set(true);
      const sentinel = createFakeSentinel();
      arriving.resolve(sentinel);

      expect(await Promise.all([first, second])).toEqual([done, done]);
      expect(sentinel.release).not.toHaveBeenCalled();
      expect(await provider.set(true)).toEqual(done);
      expect(wakeLock.request).toHaveBeenCalledTimes(1);
    });
  });

  describe("dispose", () => {
    it("adds exactly one visibilitychange listener at creation", () => {
      const { fakeDocument } = installWakeLock();

      createWakeLockProvider(kind, createMockLog());

      expect(fakeDocument.addEventListener).toHaveBeenCalledExactlyOnceWith(
        "visibilitychange",
        expect.any(Function)
      );
    });

    it("releases the held lock, removes the listener and drops the wish", async () => {
      const { wakeLock, fakeDocument } = installWakeLock();
      const provider = createWakeLockProvider(kind, createMockLog());

      await provider.set(true);
      await provider.dispose();

      expect(wakeLock.sentinels[0]?.release).toHaveBeenCalledTimes(1);
      const added = fakeDocument.addEventListener.mock.calls[0]?.[1];
      expect(fakeDocument.removeEventListener).toHaveBeenCalledExactlyOnceWith(
        "visibilitychange",
        added
      );
      expect(fakeDocument.listeners.size).toBe(0);
    });

    it("releases a lock that arrives after dispose", async () => {
      const { wakeLock } = installWakeLock();
      const arriving = Promise.withResolvers<FakeSentinel>();
      wakeLock.request.mockReturnValueOnce(arriving.promise);
      const provider = createWakeLockProvider(kind, createMockLog());

      const holding = provider.set(true);
      await provider.dispose();
      const sentinel = createFakeSentinel();
      arriving.resolve(sentinel);
      await holding;

      expect(sentinel.release).toHaveBeenCalledTimes(1);
    });

    it("set(true) after dispose answers 'unavailable' without requesting", async () => {
      const { wakeLock } = installWakeLock();
      const provider = createWakeLockProvider(kind, createMockLog());

      await provider.dispose();
      const result = await provider.set(true);

      expect(result).toEqual({
        ok: false,
        provider: kind,
        reason: "unavailable",
        message: "app stopped"
      });
      expect(wakeLock.request).not.toHaveBeenCalled();
    });

    it("is safe to call twice and releases only once", async () => {
      const { wakeLock } = installWakeLock();
      const provider = createWakeLockProvider(kind, createMockLog());

      await provider.set(true);
      await provider.dispose();
      await expect(provider.dispose()).resolves.toBeUndefined();

      expect(wakeLock.sentinels[0]?.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("no document (the API exists, the page has no visibility)", () => {
    it("set(true) takes the lock and dispose releases it", async () => {
      const { wakeLock } = installWakeLock();
      vi.stubGlobal("document", undefined);
      const provider = createWakeLockProvider(kind, createMockLog());

      expect(await provider.set(true)).toEqual(done);
      await provider.dispose();

      expect(wakeLock.sentinels[0]?.release).toHaveBeenCalledTimes(1);
    });
  });
});
