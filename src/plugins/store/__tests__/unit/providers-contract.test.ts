import "fake-indexeddb/auto";

import { describe, expect, it, vi } from "vitest";

import type { JsonValue, RuntimeKind, SystemResult } from "../../../runtime/result";
import { createTauriStoreProvider } from "../../providers/tauri";
import type { StoreProvider } from "../../providers/types";
import { createWebStoreProvider } from "../../providers/web";
import { createMockLog } from "./test-helpers";

const { mockLoad } = vi.hoisted(() => {
  const backing = new Map<string, unknown>();
  const mockLoad = vi.fn(async () => ({
    get: async (key: string) => backing.get(key),
    set: async (key: string, value: unknown) => {
      backing.set(key, value);
    },
    delete: async (key: string) => backing.delete(key),
    keys: async () => [...backing.keys()],
    clear: async () => {
      backing.clear();
    },
    save: async () => undefined
  }));
  return { mockLoad };
});

vi.mock("@tauri-apps/plugin-store", () => ({ load: mockLoad }));

type OpResult = SystemResult<JsonValue | undefined> | SystemResult<string[]> | SystemResult<void>;

/**
 * Run the same op sequence (set → get → keys → delete → get → clear → keys)
 * against a provider, collecting each SystemResult in order.
 */
async function runOpSequence(provider: StoreProvider): Promise<OpResult[]> {
  const afterSet = await provider.set("a", 1);
  const afterGet = await provider.get<number>("a");
  const afterKeys = await provider.keys();
  const afterDelete = await provider.delete("a");
  const afterDeleteGet = await provider.get<number>("a");
  const afterClear = await provider.clear();
  const afterClearKeys = await provider.keys();
  return [afterSet, afterGet, afterKeys, afterDelete, afterDeleteGet, afterClear, afterClearKeys];
}

/**
 * Strip the `provider` field so two providers' results can be compared structurally.
 */
const stripProvider = (result: OpResult): unknown =>
  result.ok
    ? { ok: true, value: result.value }
    : { ok: false, reason: result.reason, message: result.message };

describe.each<{ kind: RuntimeKind; createProvider: () => Promise<StoreProvider> }>([
  {
    kind: "web",
    createProvider: () => createWebStoreProvider({ name: "contract-web-db" }, createMockLog())
  },
  {
    kind: "tauri",
    createProvider: () => createTauriStoreProvider({ name: "contract-tauri-db" }, createMockLog())
  }
])("provider parity: $kind", ({ kind, createProvider }) => {
  it("produces structurally identical SystemResult shapes for the same op sequence", async () => {
    const provider = await createProvider();

    const results = await runOpSequence(provider);

    for (const result of results) {
      expect(result.provider).toBe(kind);
    }
    expect(results.map(result => stripProvider(result))).toEqual([
      { ok: true, value: undefined }, // set a=1
      { ok: true, value: 1 }, // get a
      { ok: true, value: ["a"] }, // keys
      { ok: true, value: undefined }, // delete a
      { ok: true, value: undefined }, // get a (after delete)
      { ok: true, value: undefined }, // clear
      { ok: true, value: [] } // keys (after clear)
    ]);
  });
});
