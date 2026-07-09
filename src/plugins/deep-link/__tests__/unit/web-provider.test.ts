import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createWebDeepLinkProvider } from "../../providers/web";
import { createMockLog } from "./test-helpers";

// `location` has no ambient declaration under this project's DOM-lib-free tsconfig
// (matches the narrow structural cast used by providers/web.ts itself).
type GlobalWithLocation = { location?: { href: string } };
const globalScope = globalThis as GlobalWithLocation;
const originalLocation = globalScope.location;

afterEach(() => {
  if (originalLocation === undefined) {
    Reflect.deleteProperty(globalScope, "location");
  } else {
    globalScope.location = originalLocation;
  }
});

describe("createWebDeepLinkProvider", () => {
  describe("with a stubbed location", () => {
    beforeEach(() => {
      globalScope.location = { href: "https://example.com/launch?ref=deeplink" };
    });

    it("getCurrent returns location.href", async () => {
      const provider = await createWebDeepLinkProvider({ schemes: [] }, createMockLog());

      const result = await provider.getCurrent();

      expect(result).toEqual({
        ok: true,
        value: "https://example.com/launch?ref=deeplink",
        provider: "web"
      });
    });

    it("never registers a push channel — the web provider has no onUrl parameter", async () => {
      // createWebDeepLinkProvider's signature intentionally omits an onUrl parameter;
      // this documents that omission (no push deliveries on web in v1).
      const provider = await createWebDeepLinkProvider({ schemes: [] }, createMockLog());

      expect(provider).not.toHaveProperty("onUrl");
    });
  });

  describe("without a location global (SSR)", () => {
    beforeEach(() => {
      Reflect.deleteProperty(globalScope, "location");
    });

    it("getCurrent returns ok(null)", async () => {
      const provider = await createWebDeepLinkProvider({ schemes: [] }, createMockLog());

      const result = await provider.getCurrent();

      // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — no location global (SSR)
      expect(result).toEqual({ ok: true, value: null, provider: "web" });
    });
  });

  it("dispose is a no-op that resolves", async () => {
    const provider = await createWebDeepLinkProvider({ schemes: [] }, createMockLog());

    await expect(provider.dispose()).resolves.toBeUndefined();
  });
});
