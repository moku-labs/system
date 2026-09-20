import { describe, expect, it, vi } from "vitest";

import { err, ok } from "../../../runtime/result";
import { createDeepLinkApi } from "../../api";
import type { DeepLinkProvider } from "../../providers/types";
import type { DeepLinkContext, DeepLinkState } from "../../types";
import { createMockLog } from "./test-helpers";

const createFakeProvider = (overrides?: Partial<DeepLinkProvider>): DeepLinkProvider => ({
  getCurrent: vi.fn(async () => ok("myapp://open", "tauri")),
  dispose: vi.fn(async () => undefined),
  ...overrides
});

const createMockCtx = (overrides?: Partial<DeepLinkContext>): DeepLinkContext => ({
  config: { schemes: [], ...overrides?.config },
  state:
    overrides?.state ??
    ({
      // eslint-disable-next-line unicorn/no-null -- DeepLinkState.provider is typed `Promise<...> | null` (seam contract)
      provider: null,
      handedOver: new Map(),
      launchPhaseOpen: true,
      // eslint-disable-next-line unicorn/no-null -- the deadline is unknown until the first launch-phase URL
      launchPhaseEndsAt: null,
      subscribers: new Set()
    } satisfies DeepLinkState),
  emit: overrides?.emit ?? vi.fn(),
  global: overrides?.global ?? {},
  runtime: overrides?.runtime ?? { kind: "web", platform: "unknown" },
  log: overrides?.log ?? createMockLog()
});

describe("createDeepLinkApi", () => {
  describe("getCurrent", () => {
    it("returns 'unavailable' before app.start() (state.provider === null)", async () => {
      const ctx = createMockCtx();
      const api = createDeepLinkApi(ctx);

      const result = await api.getCurrent();

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "unavailable",
        message: "app not started — call app.start() first"
      });
    });

    it("delegates to the resolved provider and returns the launch URL", async () => {
      const provider = createFakeProvider({
        getCurrent: vi.fn(async () => ok("myapp://open", "tauri"))
      });
      const state: DeepLinkState = {
        provider: Promise.resolve({ ok: true, provider }),
        handedOver: new Map(),
        launchPhaseOpen: true,
        // eslint-disable-next-line unicorn/no-null -- the deadline is unknown until the first launch-phase URL
        launchPhaseEndsAt: null,
        subscribers: new Set()
      };
      const ctx = createMockCtx({ state });
      const api = createDeepLinkApi(ctx);

      const result = await api.getCurrent();

      expect(result).toEqual({ ok: true, value: "myapp://open", provider: "tauri" });
      expect(provider.getCurrent).toHaveBeenCalledWith();
    });

    it("passes through a pre-failed resolution without calling the provider", async () => {
      const failure = err("tauri", "unavailable", "boom");
      const state: DeepLinkState = {
        provider: Promise.resolve({ ok: false, failure }),
        handedOver: new Map(),
        launchPhaseOpen: true,
        // eslint-disable-next-line unicorn/no-null -- the deadline is unknown until the first launch-phase URL
        launchPhaseEndsAt: null,
        subscribers: new Set()
      };
      const ctx = createMockCtx({ state });
      const api = createDeepLinkApi(ctx);

      const result = await api.getCurrent();

      expect(result).toEqual(failure);
    });

    it("passes through a provider-level failure unchanged", async () => {
      const provider = createFakeProvider({
        getCurrent: vi.fn(async () => err("tauri", "error", "read failed"))
      });
      const state: DeepLinkState = {
        provider: Promise.resolve({ ok: true, provider }),
        handedOver: new Map(),
        launchPhaseOpen: true,
        // eslint-disable-next-line unicorn/no-null -- the deadline is unknown until the first launch-phase URL
        launchPhaseEndsAt: null,
        subscribers: new Set()
      };
      const ctx = createMockCtx({ state });
      const api = createDeepLinkApi(ctx);

      const result = await api.getCurrent();

      expect(result).toEqual({
        ok: false,
        provider: "tauri",
        reason: "error",
        message: "read failed"
      });
    });

    it("returns ok(null) when the provider reports no launch URL", async () => {
      const provider = createFakeProvider({
        // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — no launch URL
        getCurrent: vi.fn(async () => ok(null, "web"))
      });
      const state: DeepLinkState = {
        provider: Promise.resolve({ ok: true, provider }),
        handedOver: new Map(),
        launchPhaseOpen: true,
        // eslint-disable-next-line unicorn/no-null -- the deadline is unknown until the first launch-phase URL
        launchPhaseEndsAt: null,
        subscribers: new Set()
      };
      const ctx = createMockCtx({ state });
      const api = createDeepLinkApi(ctx);

      const result = await api.getCurrent();

      // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — the provider reported no launch URL
      expect(result).toEqual({ ok: true, value: null, provider: "web" });
    });

    it("scheme-filters the launch URL: non-matching scheme becomes ok(null)", async () => {
      const provider = createFakeProvider({
        getCurrent: vi.fn(async () => ok("other://open", "tauri"))
      });
      const state: DeepLinkState = {
        provider: Promise.resolve({ ok: true, provider }),
        handedOver: new Map(),
        launchPhaseOpen: true,
        // eslint-disable-next-line unicorn/no-null -- the deadline is unknown until the first launch-phase URL
        launchPhaseEndsAt: null,
        subscribers: new Set()
      };
      const ctx = createMockCtx({ config: { schemes: ["myapp"] }, state });
      const api = createDeepLinkApi(ctx);

      const result = await api.getCurrent();

      // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — the URL was scheme-filtered
      expect(result).toEqual({ ok: true, value: null, provider: "tauri" });
      expect(ctx.log.debug).toHaveBeenCalledWith("deepLink:get-current-scheme-filtered", {
        url: "other://open"
      });
    });

    it("allows a matching scheme through unchanged", async () => {
      const provider = createFakeProvider({
        getCurrent: vi.fn(async () => ok("myapp://open", "tauri"))
      });
      const state: DeepLinkState = {
        provider: Promise.resolve({ ok: true, provider }),
        handedOver: new Map(),
        launchPhaseOpen: true,
        // eslint-disable-next-line unicorn/no-null -- the deadline is unknown until the first launch-phase URL
        launchPhaseEndsAt: null,
        subscribers: new Set()
      };
      const ctx = createMockCtx({ config: { schemes: ["myapp"] }, state });
      const api = createDeepLinkApi(ctx);

      const result = await api.getCurrent();

      expect(result).toEqual({ ok: true, value: "myapp://open", provider: "tauri" });
    });

    it("records the launch URL as handed over so the one-time replay can be recognized", async () => {
      const provider = createFakeProvider({
        getCurrent: vi.fn(async () => ok("myapp://open", "tauri"))
      });
      const state: DeepLinkState = {
        provider: Promise.resolve({ ok: true, provider }),
        handedOver: new Map(),
        launchPhaseOpen: true,
        // eslint-disable-next-line unicorn/no-null -- the deadline is unknown until the first launch-phase URL
        launchPhaseEndsAt: null,
        subscribers: new Set()
      };
      const ctx = createMockCtx({ state });
      const api = createDeepLinkApi(ctx);

      await api.getCurrent();

      expect(ctx.state.handedOver.get("myapp://open")).toBe("get-current");
    });

    it("does not record a scheme-filtered launch URL", async () => {
      const provider = createFakeProvider({
        getCurrent: vi.fn(async () => ok("other://open", "tauri"))
      });
      const state: DeepLinkState = {
        provider: Promise.resolve({ ok: true, provider }),
        handedOver: new Map(),
        launchPhaseOpen: true,
        // eslint-disable-next-line unicorn/no-null -- the deadline is unknown until the first launch-phase URL
        launchPhaseEndsAt: null,
        subscribers: new Set()
      };
      const ctx = createMockCtx({ config: { schemes: ["myapp"] }, state });
      const api = createDeepLinkApi(ctx);

      await api.getCurrent();

      expect(ctx.state.handedOver.size).toBe(0);
    });
  });

  describe("onOpen", () => {
    it("adds the callback to state.subscribers", () => {
      const ctx = createMockCtx();
      const api = createDeepLinkApi(ctx);
      const cb = vi.fn();

      api.onOpen(cb);

      expect(ctx.state.subscribers.has(cb)).toBe(true);
    });

    it("returns an unsubscribe function that removes the callback", () => {
      const ctx = createMockCtx();
      const api = createDeepLinkApi(ctx);
      const cb = vi.fn();

      const unsubscribe = api.onOpen(cb);
      expect(ctx.state.subscribers.has(cb)).toBe(true);

      unsubscribe();

      expect(ctx.state.subscribers.has(cb)).toBe(false);
    });

    it("supports multiple independent subscribers", () => {
      const ctx = createMockCtx();
      const api = createDeepLinkApi(ctx);
      const cbA = vi.fn();
      const cbB = vi.fn();

      const unsubscribeA = api.onOpen(cbA);
      api.onOpen(cbB);
      unsubscribeA();

      expect(ctx.state.subscribers.has(cbA)).toBe(false);
      expect(ctx.state.subscribers.has(cbB)).toBe(true);
    });
  });
});
