import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockImpactFeedback, mockNotificationFeedback, mockSelectionFeedback } = vi.hoisted(() => ({
  mockImpactFeedback: vi.fn(),
  mockNotificationFeedback: vi.fn(),
  mockSelectionFeedback: vi.fn()
}));

vi.mock("@tauri-apps/plugin-haptics", () => ({
  impactFeedback: mockImpactFeedback,
  notificationFeedback: mockNotificationFeedback,
  selectionFeedback: mockSelectionFeedback
}));

import type { RuntimeKind, SystemResult } from "../../../runtime/result";
import { loadHapticsProvider } from "../../providers/index";
import { createTauriHapticsProvider } from "../../providers/tauri";
import type { HapticsProvider } from "../../providers/types";
import { HAPTICS_METHODS } from "../../providers/types";
import { createWebHapticsProvider } from "../../providers/web";
import { createMockCtx, createMockLog, createVibrate, OK_STATUS } from "./test-helpers";

beforeEach(() => {
  mockImpactFeedback.mockReset().mockResolvedValue(OK_STATUS);
  mockNotificationFeedback.mockReset().mockResolvedValue(OK_STATUS);
  mockSelectionFeedback.mockReset().mockResolvedValue(OK_STATUS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Run the same op sequence against a provider, collecting each SystemResult in order. */
async function runOpSequence(provider: HapticsProvider): Promise<SystemResult<void>[]> {
  const impact = await provider.impact("light");
  const notify = await provider.notify("success");
  const selection = await provider.selection();
  return [impact, notify, selection];
}

/** Strip the `provider` field so two providers' results can be compared structurally. */
const stripProvider = (result: SystemResult<void>): unknown =>
  result.ok
    ? { ok: true, value: result.value }
    : { ok: false, reason: result.reason, message: result.message };

describe.each<{ kind: RuntimeKind; createProvider: () => Promise<HapticsProvider> }>([
  {
    kind: "web",
    createProvider: () => {
      vi.stubGlobal("navigator", { vibrate: createVibrate() });
      return createWebHapticsProvider(createMockLog());
    }
  },
  {
    kind: "tauri",
    createProvider: () => createTauriHapticsProvider(createMockLog())
  }
])("provider parity: $kind", ({ kind, createProvider }) => {
  it("exposes every HAPTICS_METHODS entry plus dispose()", async () => {
    const provider = await createProvider();

    for (const method of HAPTICS_METHODS) {
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
      { ok: true, value: undefined },
      { ok: true, value: undefined },
      { ok: true, value: undefined }
    ]);
  });

  it("dispose() resolves without throwing", async () => {
    const provider = await createProvider();

    await expect(provider.dispose()).resolves.toBeUndefined();
  });
});

describe.each<{ kind: RuntimeKind; createProvider: () => Promise<HapticsProvider> }>([
  {
    kind: "web",
    createProvider: () => {
      vi.stubGlobal("navigator", {});
      return createWebHapticsProvider(createMockLog());
    }
  },
  {
    kind: "tauri",
    createProvider: () =>
      loadHapticsProvider(createMockCtx({ runtime: { kind: "tauri", platform: "macos" } }))()
  }
])("unsupported stand-in parity: $kind", ({ kind, createProvider }) => {
  it("exposes the same methods, each answering 'unsupported' for its kind", async () => {
    const provider = await createProvider();

    const results = await runOpSequence(provider);

    expect(results).toEqual(
      HAPTICS_METHODS.map(() => ({ ok: false, provider: kind, reason: "unsupported" }))
    );
    await expect(provider.dispose()).resolves.toBeUndefined();
  });
});
