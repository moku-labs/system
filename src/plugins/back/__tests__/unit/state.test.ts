import { describe, expect, it } from "vitest";

import { createBackState } from "../../state";

describe("createBackState", () => {
  it("starts with an empty resolution slot, no handlers and no native listener", () => {
    const state = createBackState();

    expect(state.provider).toBeNull();
    expect(state.handlers).toEqual([]);
    expect(state.listening).toBe(false);
    expect(state.teardown).toBeUndefined();
  });

  it("starts with an idle reconcile queue that is already resolved", async () => {
    const state = createBackState();

    await expect(state.queue).resolves.toBeUndefined();
  });

  it("gives every app its own handler stack", () => {
    const first = createBackState();
    const second = createBackState();

    first.handlers.push(() => true);

    expect(second.handlers).toEqual([]);
  });
});
