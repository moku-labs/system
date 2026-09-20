import { describe, expect, it } from "vitest";

import { createDeepLinkState } from "../../state";

describe("createDeepLinkState", () => {
  it("returns a resolution slot with no provider yet, no launch URL, and no subscribers", () => {
    const state = createDeepLinkState({ global: {}, config: { schemes: [] } });

    expect(state.provider).toBeNull();

    expect(state.launchUrl).toBeNull();
    expect(state.launchReplayDone).toBe(false);
    expect(state.subscribers).toBeInstanceOf(Set);
    expect(state.subscribers.size).toBe(0);
  });
});
