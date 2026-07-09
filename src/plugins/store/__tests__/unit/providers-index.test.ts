import { beforeEach, describe, expect, it, vi } from "vitest";

const { fakeStore, mockLoad } = vi.hoisted(() => {
  const fakeStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    keys: vi.fn(),
    clear: vi.fn(),
    save: vi.fn()
  };
  const mockLoad = vi.fn(async () => fakeStore);
  return { fakeStore, mockLoad };
});

vi.mock("@tauri-apps/plugin-store", () => ({ load: mockLoad }));

import "fake-indexeddb/auto";

import { loadStoreProvider } from "../../providers/index";
import type { StoreContext } from "../../types";
import { createMockLog } from "./test-helpers";

beforeEach(() => {
  mockLoad.mockClear();
  mockLoad.mockImplementation(async () => fakeStore);
});

const createMockCtx = (overrides?: Partial<StoreContext>): StoreContext => ({
  config: { name: "providers-index-db", ...overrides?.config },
  // eslint-disable-next-line unicorn/no-null -- StoreState.provider is typed `Promise<...> | null` (seam contract)
  state: overrides?.state ?? { provider: null },
  emit: overrides?.emit ?? vi.fn(),
  global: overrides?.global ?? {},
  runtime: overrides?.runtime ?? { kind: "web", platform: "unknown" },
  log: overrides?.log ?? createMockLog()
});

describe("loadStoreProvider", () => {
  it("selects the Tauri provider when ctx.runtime.kind is 'tauri'", async () => {
    const ctx = createMockCtx({ runtime: { kind: "tauri", platform: "macos" } });

    const load = loadStoreProvider(ctx);
    const provider = await load();

    expect(mockLoad).toHaveBeenCalledWith("providers-index-db.json", {
      defaults: {},
      autoSave: false
    });
    const result = await provider.get("k");
    expect(result.provider).toBe("tauri");
  });

  it("selects the web provider when ctx.runtime.kind is 'web'", async () => {
    const ctx = createMockCtx({ runtime: { kind: "web", platform: "unknown" } });

    const load = loadStoreProvider(ctx);
    const provider = await load();

    const result = await provider.get("k");
    expect(result.provider).toBe("web");
  });
});
