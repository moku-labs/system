import { describe, expect, it, vi } from "vitest";

import { createLifecycleApi, createSignal } from "../../api";
import type { Unsubscribe } from "../../types";
import { createMockCtx } from "./test-helpers";

describe("createLifecycleApi", () => {
  describe("onPause", () => {
    it("adds the callback to the pause subscribers only", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const signal = createSignal(ctx);
      const fn = vi.fn();

      api.onPause(fn);
      signal("pause");
      expect(fn).toHaveBeenCalledTimes(1);

      signal("resume");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("returns a remover that deletes the callback", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const fn = vi.fn();

      const offPause = api.onPause(fn);
      expect(ctx.state.pauseSubscribers.size).toBe(1);
      offPause();

      expect(ctx.state.pauseSubscribers.size).toBe(0);
    });

    it("a remover deletes only its own callback", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const signal = createSignal(ctx);
      const first = vi.fn();
      const second = vi.fn();

      const offFirst = api.onPause(first);
      api.onPause(second);
      offFirst();
      signal("pause");

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
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
      const signal = createSignal(ctx);
      const fn = vi.fn();

      api.onResume(fn);
      signal("pause");
      expect(fn).not.toHaveBeenCalled();

      signal("resume");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("a remover deletes only its own callback", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const signal = createSignal(ctx);
      const first = vi.fn();
      const second = vi.fn();

      api.onResume(first);
      const offSecond = api.onResume(second);
      offSecond();
      signal("pause");
      signal("resume");

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).not.toHaveBeenCalled();
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

    it("the same fn subscribed twice runs twice per transition", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const signal = createSignal(ctx);
      const fn = vi.fn();
      api.onPause(fn);
      api.onPause(fn);

      signal("pause");

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("each remover of a twice-subscribed fn removes one subscription", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const signal = createSignal(ctx);
      const fn = vi.fn();
      const offFirst = api.onResume(fn);
      const offSecond = api.onResume(fn);

      offFirst();
      signal("pause");
      signal("resume");
      expect(fn).toHaveBeenCalledTimes(1);

      offSecond();
      signal("pause");
      signal("resume");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("calling a remover twice does not remove the other subscription", () => {
      const ctx = createMockCtx();
      const api = createLifecycleApi(ctx);
      const signal = createSignal(ctx);
      const fn = vi.fn();
      const offFirst = api.onPause(fn);
      api.onPause(fn);

      offFirst();
      offFirst();
      signal("pause");

      expect(fn).toHaveBeenCalledTimes(1);
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
