import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

// Only Tauri iOS and Android may pull the Tauri provider module into the graph: this
// factory throws the moment ./tauri is evaluated, so a static import turns the file red.
vi.mock("../../providers/tauri", () => {
  throw new Error("haptics providers/tauri was evaluated");
});

import { loadHapticsProvider } from "../../providers/index";
import { createMockCtx } from "./test-helpers";

const resolverSource = readFileSync(new URL("../../providers/index.ts", import.meta.url), "utf8");
const tauriSource = readFileSync(new URL("../../providers/tauri.ts", import.meta.url), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadHapticsProvider — lazy Tauri boundary", () => {
  it("reaches ./tauri only through a dynamic import so bundlers can code-split it", () => {
    expect(resolverSource).not.toContain('from "./tauri"');
    expect(resolverSource).toContain('await import("./tauri")');
  });

  it("reaches @tauri-apps/plugin-haptics only through a dynamic import inside the factory", () => {
    expect(tauriSource).not.toMatch(/from "@tauri-apps\//);
    expect(tauriSource).toMatch(/await import\(\s*"@tauri-apps\/plugin-haptics"\s*\)/);
  });

  it("resolves the web provider without evaluating the tauri module", async () => {
    vi.stubGlobal("navigator", {});
    const ctx = createMockCtx({ runtime: { kind: "web", platform: "unknown" } });

    const provider = await loadHapticsProvider(ctx)();
    const result = await provider.impact("light");

    expect(result.provider).toBe("web");
  });

  it("resolves the desktop stand-in without evaluating the tauri module", async () => {
    const ctx = createMockCtx({ runtime: { kind: "tauri", platform: "macos" } });

    const provider = await loadHapticsProvider(ctx)();

    expect(await provider.notify("success")).toEqual({
      ok: false,
      provider: "tauri",
      reason: "unsupported"
    });
  });

  it("evaluates the tauri module on a mobile platform", async () => {
    const ctx = createMockCtx({ runtime: { kind: "tauri", platform: "android" } });

    await expect(loadHapticsProvider(ctx)()).rejects.toThrow();
  });
});
