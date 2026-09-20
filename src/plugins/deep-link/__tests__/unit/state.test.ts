import { describe, expect, it } from "vitest";

import { createDeepLinkState } from "../../state";

describe("createDeepLinkState", () => {
  it("returns a resolution slot with no provider yet, an open empty launch phase, and no subscribers", () => {
    const state = createDeepLinkState({ global: {}, config: { schemes: [] } });

    expect(state.provider).toBeNull();

    expect(state.handedOver).toBeInstanceOf(Map);
    expect(state.handedOver.size).toBe(0);
    expect(state.launchPhaseOpen).toBe(true);
    expect(state.launchPhaseEndsAt).toBeNull();
    expect(state.subscribers).toBeInstanceOf(Set);
    expect(state.subscribers.size).toBe(0);
  });
});
