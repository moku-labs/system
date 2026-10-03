import { describe, expect, it, vi } from "vitest";

import { err, ok } from "../../../runtime/result";
import { createBackApi, reconcile } from "../../api";
import type { BackContext } from "../../types";
import { createFakeProvider, createMockCtx, createTestState, resolvedWith } from "./test-helpers";

/** A started tauri-android context whose provider resolved to `provider`. */
function startedCtx(provider: ReturnType<typeof createFakeProvider>): BackContext {
  return createMockCtx({
    state: createTestState({ provider: resolvedWith(provider) }),
    runtime: { kind: "tauri", platform: "android" }
  });
}

/** Native listeners still registered: every ok listen minus every unlisten. */
function activeListeners(provider: ReturnType<typeof createFakeProvider>): number {
  return (
    vi.mocked(provider.listen).mock.calls.length - vi.mocked(provider.unlisten).mock.calls.length
  );
}

describe("reconcile — the native listener follows the handlers", () => {
  it("the first handler registers the native listener once", async () => {
    const provider = createFakeProvider();
    const ctx = startedCtx(provider);
    const api = createBackApi(ctx);

    api.onPress(() => true);
    await ctx.state.queue;

    expect(provider.listen).toHaveBeenCalledTimes(1);
    expect(ctx.state.listening).toBe(true);
  });

  it("a second handler does not register a second listener", async () => {
    const provider = createFakeProvider();
    const ctx = startedCtx(provider);
    const api = createBackApi(ctx);

    api.onPress(() => true);
    await ctx.state.queue;
    api.onPress(() => false);
    await ctx.state.queue;

    expect(provider.listen).toHaveBeenCalledTimes(1);
  });

  it("removing one of two handlers keeps the listener", async () => {
    const provider = createFakeProvider();
    const ctx = startedCtx(provider);
    const api = createBackApi(ctx);

    const off = api.onPress(() => true);
    api.onPress(() => false);
    await ctx.state.queue;
    off();
    await ctx.state.queue;

    expect(provider.unlisten).not.toHaveBeenCalled();
    expect(ctx.state.listening).toBe(true);
  });

  it("the last remove unregisters the listener once", async () => {
    const provider = createFakeProvider();
    const ctx = startedCtx(provider);
    const api = createBackApi(ctx);

    const off = api.onPress(() => true);
    await ctx.state.queue;
    off();
    off();
    await ctx.state.queue;

    expect(provider.unlisten).toHaveBeenCalledTimes(1);
    expect(ctx.state.listening).toBe(false);
  });

  it("add, remove, add in one tick ends with exactly one active listener", async () => {
    const provider = createFakeProvider();
    const ctx = startedCtx(provider);
    const api = createBackApi(ctx);

    const off = api.onPress(() => true);
    off();
    api.onPress(() => true);
    await ctx.state.queue;

    expect(activeListeners(provider)).toBe(1);
    expect(ctx.state.listening).toBe(true);
  });

  it("add and remove in one tick never touches the native side", async () => {
    const provider = createFakeProvider();
    const ctx = startedCtx(provider);
    const api = createBackApi(ctx);

    const off = api.onPress(() => true);
    off();
    await ctx.state.queue;

    expect(provider.listen).not.toHaveBeenCalled();
    expect(provider.unlisten).not.toHaveBeenCalled();
  });

  it("handlers added before start register the listener only after start", async () => {
    const provider = createFakeProvider();
    const ctx = createMockCtx({ runtime: { kind: "tauri", platform: "android" } });
    const api = createBackApi(ctx);

    api.onPress(() => true);
    await ctx.state.queue;
    expect(provider.listen).not.toHaveBeenCalled();
    expect(ctx.state.listening).toBe(false);

    // What onStart does: startResolution fills the slot, then one reconcile step.
    ctx.state.provider = resolvedWith(provider);
    reconcile(ctx);
    await ctx.state.queue;

    expect(provider.listen).toHaveBeenCalledTimes(1);
    expect(ctx.state.listening).toBe(true);
  });

  it("start with no handler registers nothing, so the system Back stays", async () => {
    const provider = createFakeProvider();
    const ctx = startedCtx(provider);

    reconcile(ctx);
    await ctx.state.queue;

    expect(provider.listen).not.toHaveBeenCalled();
  });

  it("hands listen a dispatch that runs the handlers", async () => {
    const provider = createFakeProvider();
    const ctx = startedCtx(provider);
    const api = createBackApi(ctx);
    const handler = vi.fn(() => true);

    api.onPress(handler);
    await ctx.state.queue;

    expect(provider.dispatchers[0]?.()).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("a failed listen leaves listening false, and the next subscribe retries", async () => {
    const provider = createFakeProvider({
      listen: vi
        .fn()
        .mockResolvedValueOnce(err("tauri", "error", "listener refused"))
        .mockResolvedValue(ok(undefined, "tauri"))
    });
    const ctx = startedCtx(provider);
    const api = createBackApi(ctx);

    api.onPress(() => true);
    await ctx.state.queue;
    expect(ctx.state.listening).toBe(false);

    api.onPress(() => true);
    await ctx.state.queue;

    expect(provider.listen).toHaveBeenCalledTimes(2);
    expect(ctx.state.listening).toBe(true);
  });

  it("a failed resolution means no listener is wanted", async () => {
    const provider = createFakeProvider();
    const ctx = createMockCtx({
      state: createTestState({
        provider: Promise.resolve({ ok: false, failure: err("tauri", "unavailable", "boom") })
      })
    });
    const api = createBackApi(ctx);

    api.onPress(() => true);
    await ctx.state.queue;

    expect(provider.listen).not.toHaveBeenCalled();
    expect(ctx.state.listening).toBe(false);
  });

  it("ignores a failed unlisten and marks the listener gone", async () => {
    const provider = createFakeProvider({
      unlisten: vi.fn(async () => err("tauri", "error", "unregister failed"))
    });
    const ctx = startedCtx(provider);
    const api = createBackApi(ctx);

    const off = api.onPress(() => true);
    await ctx.state.queue;
    off();
    await ctx.state.queue;

    expect(ctx.state.listening).toBe(false);
  });

  it("logs a step that throws and keeps the queue working", async () => {
    const provider = createFakeProvider({
      listen: vi
        .fn()
        .mockRejectedValueOnce(new Error("bridge gone"))
        .mockResolvedValue(ok(undefined, "tauri"))
    });
    const ctx = startedCtx(provider);
    const api = createBackApi(ctx);

    api.onPress(() => true);
    await ctx.state.queue;
    expect(ctx.log.error).toHaveBeenCalledWith(
      "back:reconcile-failed",
      undefined,
      new Error("bridge gone")
    );

    api.onPress(() => true);
    await ctx.state.queue;

    expect(provider.listen).toHaveBeenCalledTimes(2);
    expect(ctx.state.listening).toBe(true);
  });

  it("wraps a non-Error step failure into an Error for the log", async () => {
    const provider = createFakeProvider({
      listen: vi.fn().mockRejectedValueOnce("plain string")
    });
    const ctx = startedCtx(provider);
    const api = createBackApi(ctx);

    api.onPress(() => true);
    await ctx.state.queue;

    const logged = vi.mocked(ctx.log.error).mock.calls[0]?.[2];
    expect(logged).toBeInstanceOf(Error);
    expect(logged?.message).toBe("plain string");
  });
});
