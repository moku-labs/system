import { describe, expect, it } from "vitest";

import { createClipboardState } from "../../state";

describe("createClipboardState", () => {
  it("returns an empty resolution slot", () => {
    const state = createClipboardState();

    // eslint-disable-next-line unicorn/no-null -- asserting the seam contract's null sentinel
    expect(state).toEqual({ provider: null });
  });
});
