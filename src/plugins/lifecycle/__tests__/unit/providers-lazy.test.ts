import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// The web path must never pull the Tauri provider module into the graph: this factory
// throws the moment ./tauri is evaluated, so a static import turns the file red.
vi.mock("../../providers/tauri", () => {
  throw new Error("lifecycle providers/tauri was evaluated on the web path");
});

import { loadLifecycleProvider } from "../../providers/index";
import { createMockCtx } from "./test-helpers";

const readSource = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

const resolverSource = readSource("../../providers/index.ts");
const tauriSource = readSource("../../providers/tauri.ts");
const webSources = [
  readSource("../../providers/web.ts"),
  readSource("../../providers/visibility.ts")
];

describe("loadLifecycleProvider — lazy Tauri boundary", () => {
  it("reaches ./tauri only through a dynamic import so bundlers can code-split it", () => {
    expect(resolverSource).not.toContain('from "./tauri"');
    expect(resolverSource).toContain('await import("./tauri")');
  });

  it("reaches @tauri-apps/api/event only through a dynamic import inside the Tauri provider", () => {
    expect(tauriSource).not.toMatch(/from "@tauri-apps\//);
    expect(tauriSource).toContain('await import("@tauri-apps/api/event")');
  });

  it("the web provider and the visibility source never name @tauri-apps", () => {
    for (const source of webSources) {
      expect(source).not.toContain("@tauri-apps");
    }
  });

  it("resolves the web provider without evaluating the tauri module", async () => {
    const provider = await loadLifecycleProvider(createMockCtx(), vi.fn())();

    await expect(provider.dispose()).resolves.toBeUndefined();
  });
});
