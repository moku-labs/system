import { describe, expect, it, vi } from "vitest";

import { createSignal } from "../../api";
import type { LifecycleContext } from "../../types";
import { createMockCtx } from "./test-helpers";

/** Record every subscriber call, in order, on both sets. */
function recordCalls(ctx: LifecycleContext): string[] {
  const calls: string[] = [];
  ctx.state.pauseSubscribers.add(() => calls.push("pause"));
  ctx.state.resumeSubscribers.add(() => calls.push("resume"));
  return calls;
}

describe("createSignal — dedupe on transition", () => {
  it("pause, pause → the pause subscribers run once", () => {
    const ctx = createMockCtx();
    const calls = recordCalls(ctx);
    const signal = createSignal(ctx);

    signal("pause");
    signal("pause");

    expect(calls).toEqual(["pause"]);
  });

  it("resume without a pause before it → the resume subscribers never run", () => {
    const ctx = createMockCtx();
    const calls = recordCalls(ctx);
    const signal = createSignal(ctx);

    signal("resume");

    expect(calls).toEqual([]);
  });

  it("pause, resume, pause → three calls, in order", () => {
    const ctx = createMockCtx();
    const calls = recordCalls(ctx);
    const signal = createSignal(ctx);

    signal("pause");
    signal("resume");
    signal("pause");

    expect(calls).toEqual(["pause", "resume", "pause"]);
  });

  it("pause, resume, resume → the second resume is dropped", () => {
    const ctx = createMockCtx();
    const calls = recordCalls(ctx);
    const signal = createSignal(ctx);

    signal("pause");
    signal("resume");
    signal("resume");

    expect(calls).toEqual(["pause", "resume"]);
  });

  it("tracks the last transition in state.paused", () => {
    const ctx = createMockCtx();
    const signal = createSignal(ctx);

    signal("pause");
    expect(ctx.state.paused).toBe(true);

    signal("resume");
    expect(ctx.state.paused).toBe(false);
  });

  it("runs only the matching set: a pause never reaches a resume subscriber", () => {
    const ctx = createMockCtx();
    const resumed = vi.fn();
    ctx.state.resumeSubscribers.add(resumed);
    const signal = createSignal(ctx);

    signal("pause");

    expect(resumed).not.toHaveBeenCalled();
  });
});
