import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

// force-testing rule (runtime README): forcing kind "tauri" MUST be paired with
// vi.mock of the real Tauri modules so provider construction never reaches a real
// IPC call.
const { mockUnlisten, mockOnOpenUrl, mockGetCurrent, getHandler, resetHandler } = vi.hoisted(() => {
  const mockUnlisten = vi.fn();
  let handler: ((urls: string[]) => void) | undefined;
  const mockOnOpenUrl = vi.fn(async (h: (urls: string[]) => void) => {
    handler = h;
    return mockUnlisten;
  });
  // eslint-disable-next-line unicorn/no-null -- default mock: the Tauri plugin reports no launch URLs
  const mockGetCurrent = vi.fn(async () => null as string[] | null);
  return {
    mockUnlisten,
    mockOnOpenUrl,
    mockGetCurrent,
    getHandler: () => handler,
    resetHandler: (): void => {
      handler = undefined;
    }
  };
});

vi.mock("@tauri-apps/plugin-deep-link", () => ({
  getCurrent: mockGetCurrent,
  onOpenUrl: mockOnOpenUrl
}));

import { coreConfig } from "../../../../config";
import type { SystemErrorReason, SystemResult } from "../../../../index";
import type { RuntimeConfig } from "../../../runtime/types";
import { deepLinkPlugin } from "../../index";
import type { DeepLinkConfig } from "../../types";

type ObservedEvent = { url: string };

/**
 * Framework-internal integration bootstrap (house style: framework `__tests__` may
 * import/reuse `coreConfig` directly). Registers `deepLinkPlugin` plus a probe plugin
 * that `depends: [deepLinkPlugin]` and hooks `deepLink:open` — the only way to observe
 * the typed event outside the plugin itself, proving the depends-gated visibility
 * contract (spec/07 §2/§5).
 */
function buildDeepLinkApp(
  overrides: { runtime?: Partial<RuntimeConfig>; deepLink?: Partial<DeepLinkConfig> },
  observed: ObservedEvent[]
) {
  const probePlugin = coreConfig.createPlugin("deepLinkProbe", {
    depends: [deepLinkPlugin],
    hooks: () => ({
      "deepLink:open": (payload: ObservedEvent) => {
        observed.push(payload);
      }
    })
  });

  const framework = coreConfig.createCore(coreConfig, {
    plugins: [deepLinkPlugin, probePlugin],
    pluginConfigs: overrides
  });
  return framework.createApp();
}

beforeEach(() => {
  mockGetCurrent.mockClear();
  // eslint-disable-next-line unicorn/no-null -- default mock: the Tauri plugin reports no launch URLs
  mockGetCurrent.mockImplementation(async () => null);
  mockOnOpenUrl.mockClear();
  resetHandler();
  mockUnlisten.mockClear();
});

describe("complex tier: deepLink plugin (integration)", () => {
  describe("forceKind 'tauri' — simulated OS deliveries", () => {
    it("start → simulated OS delivery → onOpen fires once and deepLink:open is observed via the probe plugin", async () => {
      const observed: ObservedEvent[] = [];
      const app = buildDeepLinkApp({ runtime: { forceKind: "tauri" } }, observed);
      await app.start();
      // Resolution (including onOpenUrl registration) is fire-and-forget from
      // onStart; awaiting a resolved-provider API call guarantees it has settled
      // before the OS delivery is simulated below.
      await app.deepLink.getCurrent();
      const received: ObservedEvent[] = [];
      app.deepLink.onOpen(payload => received.push(payload));

      const handler = getHandler();
      expect(handler).toBeDefined();
      handler?.(["myapp://open"]);

      expect(received).toEqual([{ url: "myapp://open" }]);
      expect(observed).toEqual([{ url: "myapp://open" }]);

      await app.stop();
    });

    it("the launch URL replayed onto the fresh listener is dropped exactly once", async () => {
      mockGetCurrent.mockResolvedValue(["myapp://launch"]);
      const observed: ObservedEvent[] = [];
      const app = buildDeepLinkApp({ runtime: { forceKind: "tauri" } }, observed);
      await app.start();
      // The app reads the launch URL, exactly as an island would at boot.
      expect(await app.deepLink.getCurrent()).toEqual({
        ok: true,
        value: "myapp://launch",
        provider: "tauri"
      });
      const received: ObservedEvent[] = [];
      app.deepLink.onOpen(payload => received.push(payload));

      const handler = getHandler();
      // The OS replays the same URL onto the listener — the app must not route twice.
      handler?.(["myapp://launch"]);

      expect(received).toHaveLength(0);
      expect(observed).toHaveLength(0);

      await app.stop();
    });

    it("the same URL opened again after the replay IS delivered", async () => {
      mockGetCurrent.mockResolvedValue(["myapp://launch"]);
      const observed: ObservedEvent[] = [];
      const app = buildDeepLinkApp({ runtime: { forceKind: "tauri" } }, observed);
      await app.start();
      await app.deepLink.getCurrent();
      const received: ObservedEvent[] = [];
      app.deepLink.onOpen(payload => received.push(payload));

      const handler = getHandler();
      handler?.(["myapp://launch"]);
      handler?.(["myapp://launch"]);

      expect(received).toEqual([{ url: "myapp://launch" }]);
      expect(observed).toEqual([{ url: "myapp://launch" }]);

      await app.stop();
    });

    it("a repeat delivery of the same URL with no launch URL involved is delivered twice", async () => {
      const observed: ObservedEvent[] = [];
      const app = buildDeepLinkApp({ runtime: { forceKind: "tauri" } }, observed);
      await app.start();
      await app.deepLink.getCurrent();
      const received: ObservedEvent[] = [];
      app.deepLink.onOpen(payload => received.push(payload));

      const handler = getHandler();
      handler?.(["myapp://open"]);
      handler?.(["myapp://open"]);

      expect(received).toEqual([{ url: "myapp://open" }, { url: "myapp://open" }]);

      await app.stop();
    });

    it("two different URLs are both delivered", async () => {
      const observed: ObservedEvent[] = [];
      const app = buildDeepLinkApp({ runtime: { forceKind: "tauri" } }, observed);
      await app.start();
      await app.deepLink.getCurrent();
      const received: ObservedEvent[] = [];
      app.deepLink.onOpen(payload => received.push(payload));

      const handler = getHandler();
      handler?.(["myapp://a"]);
      handler?.(["myapp://b"]);

      expect(received).toEqual([{ url: "myapp://a" }, { url: "myapp://b" }]);

      await app.stop();
    });

    it("app.stop() unregisters the OS listener via the mocked unlisten", async () => {
      const observed: ObservedEvent[] = [];
      const app = buildDeepLinkApp({ runtime: { forceKind: "tauri" } }, observed);
      await app.start();
      // Awaiting a resolved-provider API call guarantees resolution (including the
      // teardown entry's dispose binding) has settled before stop() runs.
      await app.deepLink.getCurrent();

      await app.stop();

      expect(mockUnlisten).toHaveBeenCalledTimes(1);
    });

    it("schemes filter applies end-to-end: a non-matching delivery is dropped, a matching one arrives", async () => {
      const observed: ObservedEvent[] = [];
      const app = buildDeepLinkApp(
        { runtime: { forceKind: "tauri" }, deepLink: { schemes: ["myapp"] } },
        observed
      );
      await app.start();
      await app.deepLink.getCurrent();
      const received: ObservedEvent[] = [];
      app.deepLink.onOpen(payload => received.push(payload));

      const handler = getHandler();
      handler?.(["other://open"]);
      expect(received).toHaveLength(0);
      expect(observed).toHaveLength(0);

      handler?.(["myapp://open"]);
      expect(received).toEqual([{ url: "myapp://open" }]);

      await app.stop();
    });

    it("getCurrent scheme-filters the launch URL end-to-end", async () => {
      mockGetCurrent.mockResolvedValue(["other://launch"]);
      const app = buildDeepLinkApp(
        { runtime: { forceKind: "tauri" }, deepLink: { schemes: ["myapp"] } },
        []
      );
      await app.start();

      const result = await app.deepLink.getCurrent();

      // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — the scheme-filtered launch URL
      expect(result).toEqual({ ok: true, value: null, provider: "tauri" });

      await app.stop();
    });
  });

  describe("forceKind 'web' — no push deliveries in v1", () => {
    it("getCurrent resolves via the web provider (no location global in the test environment → ok(null))", async () => {
      const app = buildDeepLinkApp({ runtime: { forceKind: "web" } }, []);
      await app.start();

      const result = await app.deepLink.getCurrent();

      // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — no location global in the test environment
      expect(result).toEqual({ ok: true, value: null, provider: "web" });

      await app.stop();
    });

    it("onOpen never fires — there is no OS listener wired for the web provider", async () => {
      const app = buildDeepLinkApp({ runtime: { forceKind: "web" } }, []);
      await app.start();
      const received: ObservedEvent[] = [];
      app.deepLink.onOpen(payload => received.push(payload));
      await app.deepLink.getCurrent();

      expect(received).toHaveLength(0);
      expect(mockOnOpenUrl).not.toHaveBeenCalled();

      await app.stop();
    });
  });

  describe("runtime: lifecycle", () => {
    it("API calls before app.start() resolve to 'unavailable'", async () => {
      const app = buildDeepLinkApp({ runtime: { forceKind: "web" } }, []);

      const result = await app.deepLink.getCurrent();

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "unavailable",
        message: "app not started — call app.start() first"
      });
    });
  });

  describe("runtime: config validation", () => {
    it("onInit throws when a schemes entry is not a lowercase URI scheme", () => {
      expect(() =>
        buildDeepLinkApp({ runtime: { forceKind: "web" }, deepLink: { schemes: ["MyApp"] } }, [])
      ).toThrow("[system] deepLink.schemes entries must be lowercase URI schemes");
    });

    it("onInit succeeds with the default (empty) schemes array", () => {
      const app = buildDeepLinkApp({ runtime: { forceKind: "web" } }, []);

      expect(app.deepLink).toBeDefined();
    });
  });

  describe("types: API + event signatures", () => {
    it("onOpen's callback payload is typed { url: string }", async () => {
      const app = buildDeepLinkApp({ runtime: { forceKind: "web" } }, []);
      await app.start();

      expectTypeOf(app.deepLink.onOpen)
        .parameter(0)
        .toEqualTypeOf<(payload: { url: string }) => void>();
      expectTypeOf(app.deepLink.getCurrent()).resolves.toEqualTypeOf<SystemResult<string | null>>();

      await app.stop();
    });

    it("rejects a deepLink:open payload with the wrong shape at compile time (depends-gated visibility)", () => {
      const typeProbePlugin = coreConfig.createPlugin("deepLinkTypeProbe", {
        depends: [deepLinkPlugin],
        api: ctx => ({
          rejectsWrongPayload: (): void => {
            // @ts-expect-error -- deepLink:open payload requires { url: string }, not { url: number }
            ctx.emit("deepLink:open", { url: 1 });
          }
        })
      });

      expect(typeProbePlugin).toBeDefined();
    });

    it("narrows SystemResult via the ok discriminant", async () => {
      const app = buildDeepLinkApp({ runtime: { forceKind: "web" } }, []);
      await app.start();

      const result = await app.deepLink.getCurrent();
      if (result.ok) {
        expectTypeOf(result.value).toEqualTypeOf<string | null>();
      } else {
        expectTypeOf(result.reason).toEqualTypeOf<SystemErrorReason>();
      }

      await app.stop();
    });
  });
});
