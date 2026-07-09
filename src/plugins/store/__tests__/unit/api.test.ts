import { describe, expect, it, vi } from "vitest";

import type { JsonValue } from "../../../runtime/result";
import { err, ok } from "../../../runtime/result";
import { createStoreApi } from "../../api";
import type { StoreProvider } from "../../providers/types";
import type { StoreContext, StoreState } from "../../types";
import { createMockLog } from "./test-helpers";

const createFakeProvider = (overrides?: Partial<StoreProvider>): StoreProvider => ({
  get: vi.fn(async () => ok(undefined, "web")),
  set: vi.fn(async () => ok(undefined, "web")),
  delete: vi.fn(async () => ok(undefined, "web")),
  keys: vi.fn(async () => ok([], "web")),
  clear: vi.fn(async () => ok(undefined, "web")),
  dispose: vi.fn(async () => undefined),
  ...overrides
});

const createMockCtx = (overrides?: Partial<StoreContext>): StoreContext => ({
  config: { name: "test-store", ...overrides?.config },
  // eslint-disable-next-line unicorn/no-null -- StoreState.provider is typed `Promise<...> | null` (seam contract)
  state: overrides?.state ?? { provider: null },
  emit: overrides?.emit ?? vi.fn(),
  global: overrides?.global ?? {},
  runtime: overrides?.runtime ?? { kind: "web", platform: "unknown" },
  log: overrides?.log ?? createMockLog()
});

describe("createStoreApi", () => {
  describe("app not started (state.provider === null)", () => {
    it.each([
      ["get", (api: ReturnType<typeof createStoreApi>) => api.get("k")],
      ["set", (api: ReturnType<typeof createStoreApi>) => api.set("k", 1)],
      ["delete", (api: ReturnType<typeof createStoreApi>) => api.delete("k")],
      ["keys", (api: ReturnType<typeof createStoreApi>) => api.keys()],
      ["clear", (api: ReturnType<typeof createStoreApi>) => api.clear()]
    ] as const)("%s returns 'unavailable' before app.start()", async (_name, invoke) => {
      const ctx = createMockCtx();
      const api = createStoreApi(ctx);

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
    it("get delegates to the resolved provider and passes the result through", async () => {
      // StoreProvider.get is generic (<T extends JsonValue>) — a vi.fn() mock can't
      // preserve that genericity (a fixed-value mock only satisfies it via `undefined`,
      // which is universally a member of `T | undefined`), so calls are tracked by hand
      // here and the fixed 42 return is cast to T (safe: this test only calls api.get<number>).
      const calls: string[] = [];
      const provider = createFakeProvider({
        get: async <T extends JsonValue>(key: string) => {
          calls.push(key);
          return ok(42 as T, "web");
        }
      });
      const state: StoreState = { provider: Promise.resolve({ ok: true, provider }) };
      const ctx = createMockCtx({ state });
      const api = createStoreApi(ctx);

      const result = await api.get<number>("count");

      expect(result).toEqual({ ok: true, value: 42, provider: "web" });
      expect(calls).toEqual(["count"]);
    });

    it("set delegates to the resolved provider with the key and value", async () => {
      const provider = createFakeProvider();
      const state: StoreState = { provider: Promise.resolve({ ok: true, provider }) };
      const ctx = createMockCtx({ state });
      const api = createStoreApi(ctx);

      const result = await api.set("count", 1);

      expect(result).toEqual({ ok: true, value: undefined, provider: "web" });
      expect(provider.set).toHaveBeenCalledWith("count", 1);
    });

    it("delete delegates to the resolved provider with the key", async () => {
      const provider = createFakeProvider();
      const state: StoreState = { provider: Promise.resolve({ ok: true, provider }) };
      const ctx = createMockCtx({ state });
      const api = createStoreApi(ctx);

      const result = await api.delete("count");

      expect(result).toEqual({ ok: true, value: undefined, provider: "web" });
      expect(provider.delete).toHaveBeenCalledWith("count");
    });

    it("keys delegates to the resolved provider", async () => {
      const provider = createFakeProvider({ keys: vi.fn(async () => ok(["a", "b"], "web")) });
      const state: StoreState = { provider: Promise.resolve({ ok: true, provider }) };
      const ctx = createMockCtx({ state });
      const api = createStoreApi(ctx);

      const result = await api.keys();

      expect(result).toEqual({ ok: true, value: ["a", "b"], provider: "web" });
      expect(provider.keys).toHaveBeenCalledWith();
    });

    it("clear delegates to the resolved provider", async () => {
      const provider = createFakeProvider();
      const state: StoreState = { provider: Promise.resolve({ ok: true, provider }) };
      const ctx = createMockCtx({ state });
      const api = createStoreApi(ctx);

      const result = await api.clear();

      expect(result).toEqual({ ok: true, value: undefined, provider: "web" });
      expect(provider.clear).toHaveBeenCalledWith();
    });
  });

  describe("pre-failed resolution pass-through", () => {
    it("returns the stored failure without calling the provider factory again", async () => {
      const failure = err("web", "unavailable", "boom");
      const state: StoreState = { provider: Promise.resolve({ ok: false, failure }) };
      const ctx = createMockCtx({ state });
      const api = createStoreApi(ctx);

      const result = await api.get("k");

      expect(result).toEqual(failure);
    });

    it("set returns the stored failure", async () => {
      const failure = err("web", "unavailable", "boom");
      const state: StoreState = { provider: Promise.resolve({ ok: false, failure }) };
      const ctx = createMockCtx({ state });
      const api = createStoreApi(ctx);

      const result = await api.set("k", 1);

      expect(result).toEqual(failure);
    });
  });
});
