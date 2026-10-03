import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// The web path must never pull the Tauri provider module into the graph: this factory
// throws the moment ./tauri is evaluated, so a static import turns the file red.
vi.mock("../../providers/tauri", () => {
  throw new Error("back providers/tauri was evaluated on the web path");
});

import { loadBackProvider } from "../../providers/index";
import { createMockCtx } from "./test-helpers";

const resolverSource = readFileSync(new URL("../../providers/index.ts", import.meta.url), "utf8");
const tauriSource = readFileSync(new URL("../../providers/tauri.ts", import.meta.url), "utf8");

describe("loadBackProvider — lazy Tauri boundary", () => {
  it("reaches ./tauri only through a dynamic import so bundlers can code-split it", () => {
    expect(resolverSource).not.toContain('from "./tauri"');
    expect(resolverSource).toContain('await import("./tauri")');
  });

  it("reaches @tauri-apps/api only through a dynamic import inside the factory", () => {
    expect(tauriSource).not.toMatch(/^import .* from "@tauri-apps\//m);
    expect(tauriSource).toContain('await import("@tauri-apps/api/app")');
  });

  it("names the native registry row and the peer, so a missing install says what to add", () => {
    expect(resolverSource).toContain('requirePeer("back", "@tauri-apps/api"');
  });

  it("resolves the web provider without evaluating the tauri module", async () => {
    const provider = await loadBackProvider(createMockCtx())();

    const result = await provider.exit();

    expect(result).toEqual({ ok: false, provider: "web", reason: "unsupported" });
  });

  it("resolves the non-Android tauri stand-in without evaluating the tauri module", async () => {
    const provider = await loadBackProvider(
      createMockCtx({ runtime: { kind: "tauri", platform: "ios" } })
    )();

    const result = await provider.exit();

    expect(result).toEqual({ ok: false, provider: "tauri", reason: "unsupported" });
  });
});
