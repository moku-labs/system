import { describe, expect, it } from "vitest";

import { createDeepLinkState } from "../../state";

describe("createDeepLinkState", () => {
  it("returns a resolution slot with no provider yet, no lastUrl, and no subscribers", () => {
    const state = createDeepLinkState({ global: {}, config: { schemes: [] } });

    expect(state.provider).toBeNull();

    expect(state.lastUrl).toBeNull();
    expect(state.subscribers).toBeInstanceOf(Set);
    expect(state.subscribers.size).toBe(0);
  });
});
