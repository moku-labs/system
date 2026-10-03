import { describe, expect, it, vi } from "vitest";

import { err } from "../../../runtime/result";
import { createHapticsApi } from "../../api";
import type { HapticsApi, HapticsState } from "../../types";
import { createFakeProvider, createMockCtx } from "./test-helpers";

const NOT_STARTED = "app not started — call app.start() first";

const CALLS = [
  ["impact", (api: HapticsApi) => api.impact("light")],
  ["notify", (api: HapticsApi) => api.notify("success")],
  ["selection", (api: HapticsApi) => api.selection()]
] as const;

describe("createHapticsApi", () => {
  describe("app not started (state.provider === null)", () => {
    it.each(CALLS)("%s returns 'unavailable' before app.start()", async (_name, invoke) => {
      const api = createHapticsApi(createMockCtx());

      const result = await invoke(api);

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "unavailable",
        message: NOT_STARTED
      });
    });

    it("reports the active runtime kind in the not-started failure", async () => {
      const ctx = createMockCtx({ runtime: { kind: "tauri", platform: "ios" } });
      const api = createHapticsApi(ctx);

      const result = await api.impact("heavy");

      expect(result).toEqual({
        ok: false,
        provider: "tauri",
        reason: "unavailable",
        message: NOT_STARTED
      });
    });
  });

  describe("resolved provider delegation", () => {
    it("impact hands the kind to the provider and returns its result", async () => {
      const provider = createFakeProvider();
      const state: HapticsState = { provider: Promise.resolve({ ok: true, provider }) };
      const api = createHapticsApi(createMockCtx({ state }));

      const result = await api.impact("heavy");

      expect(result).toEqual({ ok: true, value: undefined, provider: "web" });
      expect(provider.impact).toHaveBeenCalledWith("heavy");
      expect(provider.notify).not.toHaveBeenCalled();
    });

    it("notify hands the kind to the provider", async () => {
      const provider = createFakeProvider();
      const state: HapticsState = { provider: Promise.resolve({ ok: true, provider }) };
      const api = createHapticsApi(createMockCtx({ state }));

      const result = await api.notify("warning");

      expect(result).toEqual({ ok: true, value: undefined, provider: "web" });
      expect(provider.notify).toHaveBeenCalledWith("warning");
    });

    it("selection calls the provider with no argument", async () => {
      const provider = createFakeProvider();
      const state: HapticsState = { provider: Promise.resolve({ ok: true, provider }) };
      const api = createHapticsApi(createMockCtx({ state }));

      const result = await api.selection();

      expect(result).toEqual({ ok: true, value: undefined, provider: "web" });
      expect(provider.selection).toHaveBeenCalledWith();
    });

    it("passes a provider failure through unchanged", async () => {
      const refused = err("web", "unavailable", "vibrate refused — needs a user gesture first");
      const provider = createFakeProvider({ notify: vi.fn(async () => refused) });
      const state: HapticsState = { provider: Promise.resolve({ ok: true, provider }) };
      const api = createHapticsApi(createMockCtx({ state }));

      const result = await api.notify("error");

      expect(result).toEqual(refused);
    });
  });

  describe("failed resolution pass-through", () => {
    it.each(CALLS)("%s returns the stored resolution failure", async (_name, invoke) => {
      const failure = err("tauri", "unavailable", "@tauri-apps/plugin-haptics is not installed.");
      const state: HapticsState = { provider: Promise.resolve({ ok: false, failure }) };
      const api = createHapticsApi(createMockCtx({ state }));

      const result = await invoke(api);

      expect(result).toEqual(failure);
    });
  });
});
