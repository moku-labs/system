import { describe, expect, it, vi } from "vitest";

import { createLifecycleApi, createSignal } from "../../api";
import type { Unsubscribe } from "../../types";
import { createMockCtx } from "./test-helpers";

describe("createLifecycleApi", () => {
  describe("onPause", () => {
    it("adds the callback to the pause subscribers only", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const fn = vi.fn();

      api.onPause(fn);

      expect(ctx.state.pauseSubscribers.has(fn)).toBe(true);
      expect(ctx.state.resumeSubscribers.has(fn)).toBe(false);
    });

    it("returns a remover that deletes the callback", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const fn = vi.fn();

      const offPause = api.onPause(fn);
      offPause();

      expect(ctx.state.pauseSubscribers.has(fn)).toBe(false);
    });

    it("a remover deletes only its own callback", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const first = vi.fn();
      const second = vi.fn();

      const offFirst = api.onPause(first);
      api.onPause(second);
      offFirst();

      expect(ctx.state.pauseSubscribers.has(first)).toBe(false);
      expect(ctx.state.pauseSubscribers.has(second)).toBe(true);
    });

    it("works before app.start() — subscribing never waits for a provider", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);

      const offPause = api.onPause(vi.fn());

      expect(ctx.state.provider).toBeNull();
      expect(offPause).toBeTypeOf("function");
    });
  });

  describe("onResume", () => {
    it("adds the callback to the resume subscribers only", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const fn = vi.fn();

      api.onResume(fn);

      expect(ctx.state.resumeSubscribers.has(fn)).toBe(true);
      expect(ctx.state.pauseSubscribers.has(fn)).toBe(false);
    });

    it("a remover deletes only its own callback", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const first = vi.fn();
      const second = vi.fn();

      api.onResume(first);
      const offSecond = api.onResume(second);
      offSecond();

      expect(ctx.state.resumeSubscribers.has(first)).toBe(true);
      expect(ctx.state.resumeSubscribers.has(second)).toBe(false);
    });
  });

  describe("subscribers reached through the signal", () => {
    it("runs every pause subscriber in subscription order", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const signal = createSignal(ctx);
      const order: string[] = [];
      api.onPause(() => order.push("first"));
      api.onPause(() => order.push("second"));

      signal("pause");

      expect(order).toEqual(["first", "second"]);
    });

    it("a throwing subscriber is logged and the others still run", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const signal = createSignal(ctx);
      const throwing = vi.fn(() => {
        throw new Error("island crashed");
      });
      const healthy = vi.fn();
      api.onPause(throwing);
      api.onPause(healthy);

      signal("pause");

      expect(throwing).toHaveBeenCalledTimes(1);
      expect(healthy).toHaveBeenCalledTimes(1);
      expect(ctx.log.error).toHaveBeenCalledWith(
        "lifecycle:subscriber-failed",
        { phase: "pause" },
        expect.any(Error)
      );
    });

    it("wraps a non-Error throw into an Error for log.error", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const signal = createSignal(ctx);
      api.onResume(() => {
        throw "plain string throw";
      });

      signal("pause");
      signal("resume");

      const [key, data, loggedError] = vi.mocked(ctx.log.error).mock.calls[0] ?? [];
      expect(key).toBe("lifecycle:subscriber-failed");
      expect(data).toEqual({ phase: "resume" });
      expect(loggedError).toBeInstanceOf(Error);
      expect(loggedError?.message).toBe("plain string throw");
    });

    it("a removed subscriber is no longer called", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const signal = createSignal(ctx);
      const fn = vi.fn();

      const offPause = api.onPause(fn);
      offPause();
      signal("pause");

      expect(fn).not.toHaveBeenCalled();
    });

    it("a subscriber removed by an earlier one in the same round is skipped", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const signal = createSignal(ctx);
      const later = vi.fn();
      let offLater: Unsubscribe | undefined;
      api.onPause(() => offLater?.());
      offLater = api.onPause(later);

      signal("pause");

      expect(later).not.toHaveBeenCalled();
    });

    it("a subscriber added during a round waits for the next transition", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const signal = createSignal(ctx);
      const added = vi.fn();
      api.onPause(() => {
        api.onPause(added);
      });

      signal("pause");
      expect(added).not.toHaveBeenCalled();

      signal("resume");
      signal("pause");
      expect(added).toHaveBeenCalledTimes(1);
    });
  });
});
