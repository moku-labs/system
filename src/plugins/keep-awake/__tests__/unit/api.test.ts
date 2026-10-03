import { describe, expect, it, vi } from "vitest";

import { err, ok } from "../../../runtime/result";
import { createKeepAwakeApi } from "../../api";
import type { KeepAwakeProvider } from "../../providers/types";
import type { KeepAwakeContext, KeepAwakeState } from "../../types";
import { createMockLog } from "./test-helpers";

const createFakeProvider = (overrides?: Partial<KeepAwakeProvider>): KeepAwakeProvider => ({
  set: vi.fn(async () => ok(undefined, "web")),
  dispose: vi.fn(async () => undefined),
  ...overrides
});

const createMockCtx = (overrides?: Partial<KeepAwakeContext>): KeepAwakeContext => ({
  config: { ...overrides?.config },
  // eslint-disable-next-line unicorn/no-null -- KeepAwakeState.provider is typed `Promise<...> | null` (seam contract)
  state: overrides?.state ?? { provider: null },
  emit: overrides?.emit ?? vi.fn(),
  global: overrides?.global ?? {},
  runtime: overrides?.runtime ?? { kind: "web", platform: "unknown" },
  log: overrides?.log ?? createMockLog()
});

describe("createKeepAwakeApi", () => {
  it.each([true, false])("set(%s) answers 'unavailable' before app.start()", async on => {
    const api = createKeepAwakeApi(createMockCtx());

    const result = await api.set(on);

    expect(result).toEqual({
      ok: false,
      provider: "web",
      reason: "unavailable",
      message: "app not started — call app.start() first"
    });
  });

  it("tags the not-started failure with the active kind", async () => {
    const api = createKeepAwakeApi(createMockCtx({ runtime: { kind: "tauri", platform: "ios" } }));

    const result = await api.set(true);

    expect(result.provider).toBe("tauri");
  });

  it.each([true, false])("set(%s) hands the wish to the resolved provider", async on => {
    const provider = createFakeProvider();
    const state: KeepAwakeState = { provider: Promise.resolve({ ok: true, provider }) };
    const api = createKeepAwakeApi(createMockCtx({ state }));

    const result = await api.set(on);

    expect(result).toEqual({ ok: true, value: undefined, provider: "web" });
    expect(provider.set).toHaveBeenCalledExactlyOnceWith(on);
  });

  it("passes a provider failure through unchanged", async () => {
    const denied = err("web", "denied", "Battery saver is on");
    const provider = createFakeProvider({ set: vi.fn(async () => denied) });
    const state: KeepAwakeState = { provider: Promise.resolve({ ok: true, provider }) };
    const api = createKeepAwakeApi(createMockCtx({ state }));

    const result = await api.set(true);

    expect(result).toEqual(denied);
  });

  it("answers the stored failure of a failed resolution", async () => {
    const failure = err("web", "unavailable", "stopped during resolution");
    const state: KeepAwakeState = { provider: Promise.resolve({ ok: false, failure }) };
    const api = createKeepAwakeApi(createMockCtx({ state }));

    const result = await api.set(true);

    expect(result).toEqual(failure);
  });
});
