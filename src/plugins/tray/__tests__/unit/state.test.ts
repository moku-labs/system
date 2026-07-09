import { describe, expect, it } from "vitest";

import { createTrayState } from "../../state";

describe("createTrayState", () => {
  it("returns a resolution slot with no provider yet", () => {
    const state = createTrayState();

    // eslint-disable-next-line unicorn/no-null -- TrayState.provider is typed `Promise<...> | null` (seam contract)
    expect(state).toEqual({ provider: null });
  });
});
