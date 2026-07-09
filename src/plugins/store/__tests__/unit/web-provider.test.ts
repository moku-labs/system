import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.spyOn on the real "idb-keyval" module namespace fails under Vitest's ESM runner
// ("Module namespace is not configurable"), so failures are injected via a vi.mock
// wrapper instead — each test flips a hoisted flag, the wrapper throws once, then
// delegates to the real (fake-indexeddb-backed) implementation for everything else.
const { failures } = vi.hoisted(() => ({
  failures: {
    get: undefined as Error | undefined,
    set: undefined as Error | undefined
  }
}));

vi.mock("idb-keyval", async importOriginal => {
  const actual = await importOriginal<typeof import("idb-keyval")>();
  return {
    ...actual,
    get: async (...args: Parameters<typeof actual.get>): ReturnType<typeof actual.get> => {
      if (failures.get) {
        const error = failures.get;
        failures.get = undefined;
        throw error;
      }
      return actual.get(...args);
    },
    set: async (...args: Parameters<typeof actual.set>): ReturnType<typeof actual.set> => {
      if (failures.set) {
        const error = failures.set;
        failures.set = undefined;
        throw error;
      }
      return actual.set(...args);
    }
  };
});

import { createWebStoreProvider } from "../../providers/web";
import { createMockLog } from "./test-helpers";

beforeEach(() => {
  failures.get = undefined;
  failures.set = undefined;
});

describe("createWebStoreProvider", () => {
  it("round-trips all five methods against a real (fake) IndexedDB", async () => {
    const provider = await createWebStoreProvider({ name: "web-round-trip-db" }, createMockLog());

    const setResult = await provider.set("count", 42);
    expect(setResult).toEqual({ ok: true, value: undefined, provider: "web" });

    const getResult = await provider.get<number>("count");
    expect(getResult).toEqual({ ok: true, value: 42, provider: "web" });

    const keysResult = await provider.keys();
    expect(keysResult).toEqual({ ok: true, value: ["count"], provider: "web" });

    const deleteResult = await provider.delete("count");
    expect(deleteResult).toEqual({ ok: true, value: undefined, provider: "web" });

    const afterDelete = await provider.get<number>("count");
    expect(afterDelete).toEqual({ ok: true, value: undefined, provider: "web" });

    await provider.set("a", 1);
    await provider.set("b", 2);
    const clearResult = await provider.clear();
    expect(clearResult).toEqual({ ok: true, value: undefined, provider: "web" });

    const afterClear = await provider.keys();
    expect(afterClear).toEqual({ ok: true, value: [], provider: "web" });
  });

  it("get returns ok(undefined) for an absent key", async () => {
    const provider = await createWebStoreProvider({ name: "web-absent-key-db" }, createMockLog());

    const result = await provider.get("missing");

    expect(result).toEqual({ ok: true, value: undefined, provider: "web" });
  });

  it("dispose is a no-op that resolves", async () => {
    const provider = await createWebStoreProvider({ name: "web-dispose-db" }, createMockLog());

    await expect(provider.dispose()).resolves.toBeUndefined();
  });

  it("maps a method throw to reason 'error' with the message preserved", async () => {
    const provider = await createWebStoreProvider({ name: "web-op-error-db" }, createMockLog());
    failures.get = new Error("boom");

    const result = await provider.get("k");

    expect(result).toEqual({ ok: false, provider: "web", reason: "error", message: "boom" });
  });

  it("the write-probe failure propagates so the factory rejects", async () => {
    failures.set = new Error("quota exceeded");

    await expect(
      createWebStoreProvider({ name: "web-probe-fail-db" }, createMockLog())
    ).rejects.toThrow("quota exceeded");
  });
});
