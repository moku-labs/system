import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// The web path must never pull the Tauri provider module into the graph: this factory
// throws the moment ./tauri is evaluated, so a static import turns the file red.
vi.mock("../../providers/tauri", () => {
  throw new Error("store providers/tauri was evaluated on the web path");
});

import "fake-indexeddb/auto";

import { loadStoreProvider } from "../../providers/index";
import type { StoreContext } from "../../types";
import { createMockLog } from "./test-helpers";

const resolverSource = readFileSync(new URL("../../providers/index.ts", import.meta.url), "utf8");

const createWebCtx = (): StoreContext => ({
  config: { name: "lazy-boundary-db" },
  // eslint-disable-next-line unicorn/no-null -- StoreState.provider is typed `Promise<...> | null` (seam contract)
  state: { provider: null },
  emit: vi.fn(),
  global: {},
  runtime: { kind: "web", platform: "unknown" },
  log: createMockLog()
});

describe("loadStoreProvider — lazy Tauri boundary", () => {
  it("reaches ./tauri only through a dynamic import so bundlers can code-split it", () => {
    expect(resolverSource).not.toContain('from "./tauri"');
    expect(resolverSource).toContain('await import("./tauri")');
  });

  it("resolves the web provider without evaluating the tauri module", async () => {
    const provider = await loadStoreProvider(createWebCtx())();

    const result = await provider.get("k");

    expect(result.provider).toBe("web");
  });
});
