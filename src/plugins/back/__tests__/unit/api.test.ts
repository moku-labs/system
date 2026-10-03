import { describe, expect, it, vi } from "vitest";

import { err, ok } from "../../../runtime/result";
import { createBackApi, dispatch } from "../../api";
import { createFakeProvider, createMockCtx, createTestState, resolvedWith } from "./test-helpers";

describe("createBackApi", () => {
  describe("onPress + dispatch", () => {
    it("runs handlers newest first and reports false when none takes the press", () => {
      const ctx = createMockCtx();
      const api = createBackApi(ctx);
      const order: string[] = [];

      api.onPress(() => {
        order.push("oldest");
        return false;
      });
      api.onPress(() => {
        order.push("middle");
        return false;
      });
      api.onPress(() => {
        order.push("newest");
        return false;
      });

      expect(dispatch(ctx)).toBe(false);
      expect(order).toEqual(["newest", "middle", "oldest"]);
    });

    it("stops at the first handler that returns true", () => {
      const ctx = createMockCtx();
      const api = createBackApi(ctx);
      const oldest = vi.fn(() => true);
      const middle = vi.fn(() => true);
      const newest = vi.fn(() => false);

      api.onPress(oldest);
      api.onPress(middle);
      api.onPress(newest);

      expect(dispatch(ctx)).toBe(true);
      expect(newest).toHaveBeenCalledTimes(1);
      expect(middle).toHaveBeenCalledTimes(1);
      expect(oldest).not.toHaveBeenCalled();
    });

    it("reports false when no handler is registered", () => {
      const ctx = createMockCtx();

      expect(dispatch(ctx)).toBe(false);
    });

    it("logs a throwing handler, counts it as false, and still runs the older ones", () => {
      const ctx = createMockCtx();
      const api = createBackApi(ctx);
      const older = vi.fn(() => true);

      api.onPress(older);
      api.onPress(() => {
        throw new Error("popup already gone");
      });

      expect(dispatch(ctx)).toBe(true);
      expect(older).toHaveBeenCalledTimes(1);
      expect(ctx.log.error).toHaveBeenCalledWith(
        "back:subscriber-failed",
        undefined,
        new Error("popup already gone")
      );
    });

    it("wraps a non-Error throw into an Error for the log", () => {
      const ctx = createMockCtx();
      const api = createBackApi(ctx);

      api.onPress(() => {
        throw "plain string";
      });

      expect(dispatch(ctx)).toBe(false);
      const logged = vi.mocked(ctx.log.error).mock.calls[0]?.[2];
      expect(logged).toBeInstanceOf(Error);
      expect(logged?.message).toBe("plain string");
    });

    it("the remover removes its own handler only", () => {
      const ctx = createMockCtx();
      const api = createBackApi(ctx);
      const first = vi.fn(() => false);
      const second = vi.fn(() => false);

      const offFirst = api.onPress(first);
      api.onPress(second);
      offFirst();
      dispatch(ctx);

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it("a second call of the same remover removes nothing else", () => {
      const ctx = createMockCtx();
      const api = createBackApi(ctx);
      const handler = vi.fn(() => false);

      const offFirst = api.onPress(handler);
      api.onPress(handler);
      offFirst();
      offFirst();
      dispatch(ctx);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(ctx.state.handlers).toHaveLength(1);
    });

    it("a handler that removes itself during a press does not skip the next one", () => {
      const ctx = createMockCtx();
      const api = createBackApi(ctx);
      const older = vi.fn(() => false);
      api.onPress(older);
      const offSelf = api.onPress(() => {
        offSelf();
        return false;
      });

      dispatch(ctx);

      expect(older).toHaveBeenCalledTimes(1);
      expect(ctx.state.handlers).toHaveLength(1);
    });

    it("onPress returns a remover synchronously, before app.start()", () => {
      const ctx = createMockCtx();
      const api = createBackApi(ctx);

      const off = api.onPress(() => true);

      expect(typeof off).toBe("function");
      expect(ctx.state.handlers).toHaveLength(1);
    });
  });

  describe("exit", () => {
    it("returns 'unavailable' before app.start() (state.provider === null)", async () => {
      const api = createBackApi(createMockCtx());

      const result = await api.exit();

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "unavailable",
        message: "app not started — call app.start() first"
      });
    });

    it("delegates to the resolved provider", async () => {
      const provider = createFakeProvider();
      const ctx = createMockCtx({
        state: createTestState({ provider: resolvedWith(provider) }),
        runtime: { kind: "tauri", platform: "android" }
      });
      const api = createBackApi(ctx);

      const result = await api.exit();

      expect(result).toEqual(ok(undefined, "tauri"));
      expect(provider.exit).toHaveBeenCalledTimes(1);
    });

    it("passes a provider failure through unchanged", async () => {
      const provider = createFakeProvider({
        exit: vi.fn(async () => err("tauri", "error", "not allowed: core:app:allow-exit"))
      });
      const ctx = createMockCtx({ state: createTestState({ provider: resolvedWith(provider) }) });
      const api = createBackApi(ctx);

      const result = await api.exit();

      expect(result).toEqual({
        ok: false,
        provider: "tauri",
        reason: "error",
        message: "not allowed: core:app:allow-exit"
      });
    });

    it("passes a failed resolution through without calling a provider", async () => {
      const failure = err("tauri", "unavailable", "@tauri-apps/api is not installed.");
      const ctx = createMockCtx({
        state: createTestState({ provider: Promise.resolve({ ok: false, failure }) })
      });
      const api = createBackApi(ctx);

      const result = await api.exit();

      expect(result).toEqual(failure);
    });
  });
});
