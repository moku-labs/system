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

    it("getCurrent returns ok(null) for an ordinary page URL — the page itself is not a deep link", async () => {
      const provider = await createWebDeepLinkProvider({ schemes: [] }, createMockLog());

      const result = await provider.getCurrent();

      // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — no deep-link data on the page URL
      expect(result).toEqual({ ok: true, value: null, provider: "web" });
    });

    it("getCurrent returns the decoded ?deeplink= value", async () => {
      globalScope.location = {
        href: "https://example.com/launch?deeplink=myapp%3A%2F%2Fopen%3Fid%3D1&ref=mail"
      };
      const provider = await createWebDeepLinkProvider({ schemes: [] }, createMockLog());

      const result = await provider.getCurrent();

      expect(result).toEqual({ ok: true, value: "myapp://open?id=1", provider: "web" });
    });

    it("getCurrent returns the decoded #deeplink= value", async () => {
      globalScope.location = {
        href: "https://example.com/launch#deeplink=myapp%3A%2F%2Fopen"
      };
      const provider = await createWebDeepLinkProvider({ schemes: [] }, createMockLog());

      const result = await provider.getCurrent();

      expect(result).toEqual({ ok: true, value: "myapp://open", provider: "web" });
    });

    it("getCurrent returns ok(null) for an empty deeplink parameter", async () => {
      globalScope.location = { href: "https://example.com/launch?deeplink=" };
      const provider = await createWebDeepLinkProvider({ schemes: [] }, createMockLog());

      const result = await provider.getCurrent();

      // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — empty parameter carries no deep link
      expect(result).toEqual({ ok: true, value: null, provider: "web" });
    });

    it("getCurrent returns ok(null) and logs when the parameter is malformed percent-encoding", async () => {
      globalScope.location = { href: "https://example.com/launch?deeplink=%E0%A4%A" };
      const log = createMockLog();
      const provider = await createWebDeepLinkProvider({ schemes: [] }, log);

      const result = await provider.getCurrent();

      // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — undecodable parameter
      expect(result).toEqual({ ok: true, value: null, provider: "web" });
      expect(log.debug).toHaveBeenCalledWith("deepLink:web-launch-undecodable", {
        raw: "%E0%A4%A"
      });
    });

    it.each([
      ["javascript", "javascript%3Aalert(1)"],
      ["data", "data%3Atext%2Fhtml%2C%3Cscript%3Ealert(1)%3C%2Fscript%3E"],
      ["vbscript", "vbscript%3AMsgBox(1)"],
      ["blob", "blob%3Ahttps%3A%2F%2Fexample.com%2Fabcd"],
      ["file", "file%3A%2F%2F%2Fetc%2Fpasswd"]
    ])("rejects an attacker-supplied %s: deeplink parameter", async (scheme, raw) => {
      globalScope.location = { href: `https://example.com/launch?deeplink=${raw}` };
      const log = createMockLog();
      const provider = await createWebDeepLinkProvider({ schemes: [] }, log);

      const result = await provider.getCurrent();

      // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — the parameter was rejected
      expect(result).toEqual({ ok: true, value: null, provider: "web" });
      expect(log.debug).toHaveBeenCalledWith("deepLink:web-launch-rejected", { scheme });
    });

    it("rejects a rejected scheme regardless of case and surrounding whitespace", async () => {
      globalScope.location = {
        href: "https://example.com/launch?deeplink=%20%0AJaVaScRiPt%3Aalert(1)%20"
      };
      const log = createMockLog();
      const provider = await createWebDeepLinkProvider({ schemes: [] }, log);

      const result = await provider.getCurrent();

      // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — the parameter was rejected
      expect(result).toEqual({ ok: true, value: null, provider: "web" });
      expect(log.debug).toHaveBeenCalledWith("deepLink:web-launch-rejected", {
        scheme: "javascript"
      });
    });

    it("trims a surviving deeplink parameter so the scheme allowlist sees the bare URL", async () => {
      globalScope.location = {
        href: "https://example.com/launch?deeplink=%20myapp%3A%2F%2Fopen%20"
      };
      const provider = await createWebDeepLinkProvider({ schemes: [] }, createMockLog());

      const result = await provider.getCurrent();

      expect(result).toEqual({ ok: true, value: "myapp://open", provider: "web" });
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
