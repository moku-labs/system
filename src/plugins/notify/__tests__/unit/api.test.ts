import { describe, expect, it, vi } from "vitest";

import { err, ok } from "../../../runtime/result";
import { createNotifyApi } from "../../api";
import type { NotifyProvider } from "../../providers/types";
import type { NotifyContext, NotifyState } from "../../types";
import { createMockLog } from "./test-helpers";

const createFakeProvider = (overrides?: Partial<NotifyProvider>): NotifyProvider => ({
  isPermissionGranted: vi.fn(async () => ok(true, "web")),
  requestPermission: vi.fn(async () => ok(true, "web")),
  show: vi.fn(async () => ok(undefined, "web")),
  dispose: vi.fn(async () => undefined),
  ...overrides
});

const createMockCtx = (overrides?: Partial<NotifyContext>): NotifyContext => ({
  config: {},
  // eslint-disable-next-line unicorn/no-null -- NotifyState.provider is typed `Promise<...> | null` (seam contract)
  state: overrides?.state ?? { provider: null },
  emit: overrides?.emit ?? vi.fn(),
  global: overrides?.global ?? {},
  runtime: overrides?.runtime ?? { kind: "web", platform: "unknown" },
  log: overrides?.log ?? createMockLog()
});

describe("createNotifyApi", () => {
  describe("app not started (state.provider === null)", () => {
    it.each([
      [
        "isPermissionGranted",
        (api: ReturnType<typeof createNotifyApi>) => api.isPermissionGranted()
      ],
      ["requestPermission", (api: ReturnType<typeof createNotifyApi>) => api.requestPermission()],
      ["show", (api: ReturnType<typeof createNotifyApi>) => api.show({ title: "t" })]
    ] as const)("%s returns 'unavailable' before app.start()", async (_name, invoke) => {
      const ctx = createMockCtx();
      const api = createNotifyApi(ctx);

      const result = await invoke(api);

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "unavailable",
        message: "app not started — call app.start() first"
      });
    });
  });

  describe("pre-resolved provider delegation", () => {
    it("isPermissionGranted delegates to the resolved provider", async () => {
      const provider = createFakeProvider({
        isPermissionGranted: vi.fn(async () => ok(false, "web"))
      });
      const state: NotifyState = { provider: Promise.resolve({ ok: true, provider }) };
      const ctx = createMockCtx({ state });
      const api = createNotifyApi(ctx);

      const result = await api.isPermissionGranted();

      expect(result).toEqual({ ok: true, value: false, provider: "web" });
      expect(provider.isPermissionGranted).toHaveBeenCalledWith();
    });

    it("requestPermission delegates to the resolved provider", async () => {
      const provider = createFakeProvider();
      const state: NotifyState = { provider: Promise.resolve({ ok: true, provider }) };
      const ctx = createMockCtx({ state });
      const api = createNotifyApi(ctx);

      const result = await api.requestPermission();

      expect(result).toEqual({ ok: true, value: true, provider: "web" });
      expect(provider.requestPermission).toHaveBeenCalledWith();
    });

    it("show delegates to the resolved provider with the options", async () => {
      const provider = createFakeProvider();
      const state: NotifyState = { provider: Promise.resolve({ ok: true, provider }) };
      const ctx = createMockCtx({ state });
      const api = createNotifyApi(ctx);

      const result = await api.show({ title: "Done", body: "42 items" });

      expect(result).toEqual({ ok: true, value: undefined, provider: "web" });
      expect(provider.show).toHaveBeenCalledWith({ title: "Done", body: "42 items" });
    });

    it("show passes through a 'denied' failure from the provider without altering it", async () => {
      const provider = createFakeProvider({
        show: vi.fn(async () => err("web", "denied", "notification permission not granted"))
      });
      const state: NotifyState = { provider: Promise.resolve({ ok: true, provider }) };
      const ctx = createMockCtx({ state });
      const api = createNotifyApi(ctx);

      const result = await api.show({ title: "Done" });

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "denied",
        message: "notification permission not granted"
      });
    });
  });

  describe("pre-failed resolution pass-through", () => {
    it("returns the stored failure without calling the provider factory again", async () => {
      const failure = err("web", "unavailable", "boom");
      const state: NotifyState = { provider: Promise.resolve({ ok: false, failure }) };
      const ctx = createMockCtx({ state });
      const api = createNotifyApi(ctx);

      const result = await api.isPermissionGranted();

      expect(result).toEqual(failure);
    });

    it("show returns the stored failure", async () => {
      const failure = err("web", "unavailable", "boom");
      const state: NotifyState = { provider: Promise.resolve({ ok: false, failure }) };
      const ctx = createMockCtx({ state });
      const api = createNotifyApi(ctx);

      const result = await api.show({ title: "t" });

      expect(result).toEqual(failure);
    });
  });
});
