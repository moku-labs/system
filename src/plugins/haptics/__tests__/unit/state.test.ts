import { describe, expect, it } from "vitest";

import { createHapticsState } from "../../state";

describe("createHapticsState", () => {
  it("returns an empty resolution slot", () => {
    const state = createHapticsState();

    // eslint-disable-next-line unicorn/no-null -- asserting the seam contract's null sentinel
    expect(state).toEqual({ provider: null });
  });

  it("returns a fresh object per app, so two apps never share a slot", () => {
    expect(createHapticsState()).not.toBe(createHapticsState());
  });
});
