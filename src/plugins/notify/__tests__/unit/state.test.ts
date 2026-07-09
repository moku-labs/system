import { describe, expect, it } from "vitest";

import { createNotifyState } from "../../state";

describe("createNotifyState", () => {
  it("returns a resolution slot with no provider yet", () => {
    const state = createNotifyState();

    // eslint-disable-next-line unicorn/no-null -- NotifyState.provider is typed `Promise<...> | null` (seam contract)
    expect(state).toEqual({ provider: null });
  });
});
