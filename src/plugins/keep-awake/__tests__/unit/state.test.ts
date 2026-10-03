import { describe, expect, it } from "vitest";

import { createKeepAwakeState } from "../../state";

describe("createKeepAwakeState", () => {
  it("returns an empty resolution slot and nothing else", () => {
    const state = createKeepAwakeState();

    // eslint-disable-next-line unicorn/no-null -- asserting the seam contract's null sentinel
    expect(state).toEqual({ provider: null });
  });

  it("returns a fresh object per call", () => {
    expect(createKeepAwakeState()).not.toBe(createKeepAwakeState());
  });
});
