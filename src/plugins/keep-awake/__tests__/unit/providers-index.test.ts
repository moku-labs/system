import { readdirSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as WakeLockModule from "../../providers/wake-lock";

// Spy on the one factory while keeping its real behaviour: both kinds must reach it.
vi.mock("../../providers/wake-lock", async importOriginal => {
  const actual = await importOriginal<typeof WakeLockModule>();
  return { createWakeLockProvider: vi.fn(actual.createWakeLockProvider) };
});

import { loadKeepAwakeProvider } from "../../providers/index";
import { createWakeLockProvider } from "../../providers/wake-lock";
import type { KeepAwakeContext } from "../../types";
import { createMockLog, installWakeLock } from "./test-helpers";

const createCtx = (runtime: KeepAwakeContext["runtime"]): KeepAwakeContext => ({
  config: {},
  // eslint-disable-next-line unicorn/no-null -- KeepAwakeState.provider is typed `Promise<...> | null` (seam contract)
  state: { provider: null },
  emit: vi.fn(),
  global: {},
  runtime,
  log: createMockLog()
});

beforeEach(() => {
  vi.mocked(createWakeLockProvider).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadKeepAwakeProvider — one provider for both kinds (D-S03)", () => {
  it.each([
    { kind: "web", platform: "unknown" },
    { kind: "tauri", platform: "ios" },
    { kind: "tauri", platform: "android" },
    { kind: "tauri", platform: "macos" }
  ] as const)("$kind/$platform uses createWakeLockProvider with the kind passed through", async runtime => {
    installWakeLock();
    const ctx = createCtx(runtime);

    const provider = await loadKeepAwakeProvider(ctx)();
    const result = await provider.set(true);

    expect(createWakeLockProvider).toHaveBeenCalledExactlyOnceWith(runtime.kind, ctx.log);
    expect(result).toEqual({ ok: true, value: undefined, provider: runtime.kind });
  });

  it("creates the provider only when the load closure runs", () => {
    loadKeepAwakeProvider(createCtx({ kind: "web", platform: "unknown" }));

    expect(createWakeLockProvider).not.toHaveBeenCalled();
  });

  it("folds a throw while probing the API into a rejection, never a sync throw", async () => {
    vi.stubGlobal("navigator", {
      get wakeLock(): never {
        throw new Error("probe failed");
      }
    });
    const load = loadKeepAwakeProvider(createCtx({ kind: "web", platform: "unknown" }));

    let settled: Promise<unknown> | undefined;
    expect(() => {
      settled = load();
    }).not.toThrow();
    await expect(settled).rejects.toThrow("probe failed");
  });
});

describe("keepAwake source — no Tauri module, no native peer", () => {
  const pluginRoot = new URL("../../", import.meta.url);
  const sourceFiles = readdirSync(pluginRoot, { recursive: true, encoding: "utf8" }).filter(
    file => file.endsWith(".ts") && !file.includes("__tests__")
  );

  it("has no providers/tauri.ts", () => {
    expect(sourceFiles).not.toContain("providers/tauri.ts");
    expect(sourceFiles).toContain("providers/wake-lock.ts");
  });

  it.each(sourceFiles)("%s names no @tauri-apps specifier", file => {
    const source = readFileSync(new URL(file, pluginRoot), "utf8");

    expect(source).not.toContain("@tauri-apps");
  });
});
