import { describe, expect, it } from "vitest";

import { createStoreState } from "../../state";

describe("createStoreState", () => {
  it("returns a resolution slot with no provider yet", () => {
    const state = createStoreState();

    // eslint-disable-next-line unicorn/no-null -- StoreState.provider is typed `Promise<...> | null` (seam contract)
    expect(state).toEqual({ provider: null });
  });
});
