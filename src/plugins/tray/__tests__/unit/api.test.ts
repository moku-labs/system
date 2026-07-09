import { describe, expect, it, vi } from "vitest";

import { err, ok } from "../../../runtime/result";
import { createTrayApi } from "../../api";
import type { TrayProvider } from "../../providers/types";
import type { TrayContext, TrayState } from "../../types";
import { createMockLog } from "./test-helpers";

const createFakeProvider = (overrides?: Partial<TrayProvider>): TrayProvider => ({
  setMenu: vi.fn(async () => ok(undefined, "tauri")),
  setTooltip: vi.fn(async () => ok(undefined, "tauri")),
  setIcon: vi.fn(async () => ok(undefined, "tauri")),
  destroy: vi.fn(async () => ok(undefined, "tauri")),
  dispose: vi.fn(async () => undefined),
  ...overrides
});

const createMockCtx = (overrides?: Partial<TrayContext>): TrayContext => ({
  config: { id: "test-tray", ...overrides?.config },
  // eslint-disable-next-line unicorn/no-null -- TrayState.provider is typed `Promise<...> | null` (seam contract)
  state: overrides?.state ?? { provider: null },
  emit: overrides?.emit ?? vi.fn(),
  global: overrides?.global ?? {},
  runtime: overrides?.runtime ?? { kind: "web", platform: "unknown" },
  log: overrides?.log ?? createMockLog()
});

describe("createTrayApi", () => {
  describe("app not started (state.provider === null)", () => {
    it.each([
      ["setMenu", (api: ReturnType<typeof createTrayApi>) => api.setMenu([])],
      ["setTooltip", (api: ReturnType<typeof createTrayApi>) => api.setTooltip("hi")],
      ["setIcon", (api: ReturnType<typeof createTrayApi>) => api.setIcon("/icon.png")],
      ["destroy", (api: ReturnType<typeof createTrayApi>) => api.destroy()]
    ] as const)("%s returns 'unavailable' before app.start()", async (_name, invoke) => {
      const ctx = createMockCtx();
      const api = createTrayApi(ctx);

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
    it("setMenu delegates to the resolved provider with the items", async () => {
      const provider = createFakeProvider();
      const state: TrayState = { provider: Promise.resolve({ ok: true, provider }) };
      const ctx = createMockCtx({ state });
      const api = createTrayApi(ctx);
      const items = [{ id: "quit", text: "Quit" }];

      const result = await api.setMenu(items);

      expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
      expect(provider.setMenu).toHaveBeenCalledWith(items);
    });

    it("setTooltip delegates to the resolved provider with the text", async () => {
      const provider = createFakeProvider();
      const state: TrayState = { provider: Promise.resolve({ ok: true, provider }) };
      const ctx = createMockCtx({ state });
      const api = createTrayApi(ctx);

      const result = await api.setTooltip("hover text");

      expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
      expect(provider.setTooltip).toHaveBeenCalledWith("hover text");
    });

    it("setIcon delegates to the resolved provider with the path", async () => {
      const provider = createFakeProvider();
      const state: TrayState = { provider: Promise.resolve({ ok: true, provider }) };
      const ctx = createMockCtx({ state });
      const api = createTrayApi(ctx);

      const result = await api.setIcon("/path/icon.png");

      expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
      expect(provider.setIcon).toHaveBeenCalledWith("/path/icon.png");
    });

    it("destroy delegates to the resolved provider", async () => {
      const provider = createFakeProvider();
      const state: TrayState = { provider: Promise.resolve({ ok: true, provider }) };
      const ctx = createMockCtx({ state });
      const api = createTrayApi(ctx);

      const result = await api.destroy();

      expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
      expect(provider.destroy).toHaveBeenCalledWith();
    });
  });

  describe("pre-failed resolution pass-through", () => {
    it("returns the stored failure without calling the provider", async () => {
      const failure = err("tauri", "unavailable", "boom");
      const state: TrayState = { provider: Promise.resolve({ ok: false, failure }) };
      const ctx = createMockCtx({ state });
      const api = createTrayApi(ctx);

      const result = await api.setMenu([]);

      expect(result).toEqual(failure);
    });

    it("setTooltip returns the stored failure", async () => {
      const failure = err("tauri", "unavailable", "boom");
      const state: TrayState = { provider: Promise.resolve({ ok: false, failure }) };
      const ctx = createMockCtx({ state });
      const api = createTrayApi(ctx);

      const result = await api.setTooltip("hi");

      expect(result).toEqual(failure);
    });
  });
});
