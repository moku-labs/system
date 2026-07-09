import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadText, mockWriteText } = vi.hoisted(() => ({
  mockReadText: vi.fn(),
  mockWriteText: vi.fn()
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: mockReadText,
  writeText: mockWriteText
}));

import type { RuntimeKind, SystemResult } from "../../../runtime/result";
import { createTauriClipboardProvider } from "../../providers/tauri";
import type { ClipboardProvider } from "../../providers/types";
import { CLIPBOARD_METHODS } from "../../providers/types";
import { createWebClipboardProvider } from "../../providers/web";
import { createMockLog } from "./test-helpers";

beforeEach(() => {
  mockReadText.mockReset().mockResolvedValue("shared text");
  mockWriteText.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Run the same op sequence (writeText → readText) against a provider, collecting
 * each SystemResult in order.
 */
async function runOpSequence(provider: ClipboardProvider): Promise<SystemResult<unknown>[]> {
  const afterWrite = await provider.writeText("shared text");
  const afterRead = await provider.readText();
  return [afterWrite, afterRead];
}

/**
 * Strip the `provider` field so two providers' results can be compared structurally.
 */
const stripProvider = (result: SystemResult<unknown>): unknown =>
  result.ok
    ? { ok: true, value: result.value }
    : { ok: false, reason: result.reason, message: result.message };

describe.each<{ kind: RuntimeKind; createProvider: () => Promise<ClipboardProvider> }>([
  {
    kind: "web",
    createProvider: () =>
      (async () => {
        const readText = vi.fn(async () => "shared text");
        const writeText = vi.fn(async () => undefined);
        vi.stubGlobal("navigator", { clipboard: { readText, writeText } });
        return createWebClipboardProvider(createMockLog());
      })()
  },
  {
    kind: "tauri",
    createProvider: () => createTauriClipboardProvider(createMockLog())
  }
])("provider parity: $kind", ({ kind, createProvider }) => {
  it("exposes every CLIPBOARD_METHODS entry plus dispose()", async () => {
    const provider = await createProvider();

    for (const method of CLIPBOARD_METHODS) {
      expect(typeof provider[method]).toBe("function");
    }
    expect(typeof provider.dispose).toBe("function");
  });

  it("produces structurally identical SystemResult shapes for the same op sequence", async () => {
    const provider = await createProvider();

    const results = await runOpSequence(provider);

    for (const result of results) {
      expect(result.provider).toBe(kind);
    }
    expect(results.map(result => stripProvider(result))).toEqual([
      { ok: true, value: undefined }, // writeText
      { ok: true, value: "shared text" } // readText
    ]);
  });

  it("dispose() resolves without throwing", async () => {
    const provider = await createProvider();

    await expect(provider.dispose()).resolves.toBeUndefined();
  });
});
