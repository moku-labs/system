import { describe, expect, it, vi } from "vitest";

import { err, ok } from "../../../runtime/result";
import { createClipboardApi } from "../../api";
import type { ClipboardProvider } from "../../providers/types";
import type { ClipboardContext, ClipboardState } from "../../types";
import { createMockLog } from "./test-helpers";

const createFakeProvider = (overrides?: Partial<ClipboardProvider>): ClipboardProvider => ({
  readText: vi.fn(async () => ok("clipboard text", "web")),
  writeText: vi.fn(async () => ok(undefined, "web")),
  dispose: vi.fn(async () => undefined),
  ...overrides
});

const createMockCtx = (overrides?: Partial<ClipboardContext>): ClipboardContext => ({
  config: { ...overrides?.config },
  // eslint-disable-next-line unicorn/no-null -- ClipboardState.provider is typed `Promise<...> | null` (seam contract)
  state: overrides?.state ?? { provider: null },
  emit: overrides?.emit ?? vi.fn(),
  global: overrides?.global ?? {},
  runtime: overrides?.runtime ?? { kind: "web", platform: "unknown" },
  log: overrides?.log ?? createMockLog()
});

describe("createClipboardApi", () => {
  describe("app not started (state.provider === null)", () => {
    it.each([
      ["readText", (api: ReturnType<typeof createClipboardApi>) => api.readText()],
      ["writeText", (api: ReturnType<typeof createClipboardApi>) => api.writeText("hi")]
    ] as const)("%s returns 'unavailable' before app.start()", async (_name, invoke) => {
      const ctx = createMockCtx();
      const api = createClipboardApi(ctx);

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
    it("readText delegates to the resolved provider and passes the result through", async () => {
      const provider = createFakeProvider({
        readText: vi.fn(async () => ok("copied value", "web"))
      });
      const state: ClipboardState = { provider: Promise.resolve({ ok: true, provider }) };
      const ctx = createMockCtx({ state });
      const api = createClipboardApi(ctx);

      const result = await api.readText();

      expect(result).toEqual({ ok: true, value: "copied value", provider: "web" });
      expect(provider.readText).toHaveBeenCalledWith();
    });

    it("writeText delegates to the resolved provider with the text", async () => {
      const provider = createFakeProvider();
      const state: ClipboardState = { provider: Promise.resolve({ ok: true, provider }) };
      const ctx = createMockCtx({ state });
      const api = createClipboardApi(ctx);

      const result = await api.writeText("share this");

      expect(result).toEqual({ ok: true, value: undefined, provider: "web" });
      expect(provider.writeText).toHaveBeenCalledWith("share this");
    });

    it("readText passes through a provider failure unchanged", async () => {
      const provider = createFakeProvider({
        readText: vi.fn(async () => err("web", "denied", "NotAllowedError"))
      });
      const state: ClipboardState = { provider: Promise.resolve({ ok: true, provider }) };
      const ctx = createMockCtx({ state });
      const api = createClipboardApi(ctx);

      const result = await api.readText();

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "denied",
        message: "NotAllowedError"
      });
    });
  });

  describe("pre-failed resolution pass-through", () => {
    it("readText returns the stored failure without calling the provider factory again", async () => {
      const failure = err("web", "unavailable", "boom");
      const state: ClipboardState = { provider: Promise.resolve({ ok: false, failure }) };
      const ctx = createMockCtx({ state });
      const api = createClipboardApi(ctx);

      const result = await api.readText();

      expect(result).toEqual(failure);
    });

    it("writeText returns the stored failure", async () => {
      const failure = err("web", "unavailable", "boom");
      const state: ClipboardState = { provider: Promise.resolve({ ok: false, failure }) };
      const ctx = createMockCtx({ state });
      const api = createClipboardApi(ctx);

      const result = await api.writeText("k");

      expect(result).toEqual(failure);
    });
  });
});
