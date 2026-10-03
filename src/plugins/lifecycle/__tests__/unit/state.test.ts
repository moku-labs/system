import { describe, expect, it } from "vitest";

import { createLifecycleState } from "../../state";

describe("createLifecycleState", () => {
  it("starts with no provider, in the foreground, with no subscribers", () => {
    const state = createLifecycleState();

    expect(state.provider).toBeNull();
    expect(state.teardown).toBeUndefined();
    expect(state.paused).toBe(false);
    expect(state.pauseSubscribers).toBeInstanceOf(Set);
    expect(state.pauseSubscribers.size).toBe(0);
    expect(state.resumeSubscribers).toBeInstanceOf(Set);
    expect(state.resumeSubscribers.size).toBe(0);
  });

  it("returns fresh subscriber sets on every call", () => {
    const first = createLifecycleState();
    const second = createLifecycleState();

    expect(first.pauseSubscribers).not.toBe(second.pauseSubscribers);
    expect(first.resumeSubscribers).not.toBe(second.resumeSubscribers);
  });
});
