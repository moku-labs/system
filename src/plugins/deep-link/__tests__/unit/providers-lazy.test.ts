import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// The web path must never pull the Tauri provider module into the graph: this factory
// throws the moment ./tauri is evaluated, so a static import turns the file red.
vi.mock("../../providers/tauri", () => {
  throw new Error("deep-link providers/tauri was evaluated on the web path");
});

import { loadDeepLinkProvider } from "../../providers/index";
import type { DeepLinkContext } from "../../types";
import { createMockLog } from "./test-helpers";

const resolverSource = readFileSync(new URL("../../providers/index.ts", import.meta.url), "utf8");

const createWebCtx = (): DeepLinkContext => ({
  config: { schemes: [] },
  state: {
    // eslint-disable-next-line unicorn/no-null -- DeepLinkState.provider is typed `Promise<...> | null` (seam contract)
    provider: null,
    handedOver: new Map(),
    launchPhaseOpen: true,
    // eslint-disable-next-line unicorn/no-null -- the deadline is unknown until the first launch-phase URL
    launchPhaseEndsAt: null,
    subscribers: new Set()
  },
  emit: vi.fn(),
  global: {},
  runtime: { kind: "web", platform: "unknown" },
  log: createMockLog()
});

describe("loadDeepLinkProvider — lazy Tauri boundary", () => {
  it("reaches ./tauri only through a dynamic import so bundlers can code-split it", () => {
    expect(resolverSource).not.toContain('from "./tauri"');
    expect(resolverSource).toContain('await import("./tauri")');
  });

  it("resolves the web provider without evaluating the tauri module", async () => {
    const provider = await loadDeepLinkProvider(createWebCtx(), vi.fn())();

    const result = await provider.getCurrent();

    expect(result.provider).toBe("web");
  });
});
