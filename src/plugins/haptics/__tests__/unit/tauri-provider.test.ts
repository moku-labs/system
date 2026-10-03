import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { createTauriHapticsProvider } from "../../providers/tauri";
import type { HapticsProvider } from "../../providers/types";
import { createMockLog, OK_STATUS } from "./test-helpers";

const CALLS = [
  {
    method: "impact",
    invoke: (provider: HapticsProvider) => provider.impact("light"),
    binding: mockImpactFeedback
  },
  {
    method: "notify",
    invoke: (provider: HapticsProvider) => provider.notify("success"),
    binding: mockNotificationFeedback
  },
  {
    method: "selection",
    invoke: (provider: HapticsProvider) => provider.selection(),
    binding: mockSelectionFeedback
  }
] as const;

beforeEach(() => {
  mockImpactFeedback.mockReset().mockResolvedValue(OK_STATUS);
  mockNotificationFeedback.mockReset().mockResolvedValue(OK_STATUS);
  mockSelectionFeedback.mockReset().mockResolvedValue(OK_STATUS);
});

describe("createTauriHapticsProvider", () => {
  it.each([
    "light",
    "medium",
    "heavy"
  ] as const)("impact(%s) calls impactFeedback with the same style", async kind => {
    const provider = await createTauriHapticsProvider(createMockLog());

    const result = await provider.impact(kind);

    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(mockImpactFeedback).toHaveBeenCalledExactlyOnceWith(kind);
  });

  it.each([
    "success",
    "warning",
    "error"
  ] as const)("notify(%s) calls notificationFeedback with the same type", async kind => {
    const provider = await createTauriHapticsProvider(createMockLog());

    const result = await provider.notify(kind);

    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(mockNotificationFeedback).toHaveBeenCalledExactlyOnceWith(kind);
  });

  it("selection calls selectionFeedback with no argument", async () => {
    const provider = await createTauriHapticsProvider(createMockLog());

    const result = await provider.selection();

    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(mockSelectionFeedback).toHaveBeenCalledExactlyOnceWith();
    expect(mockImpactFeedback).not.toHaveBeenCalled();
  });

  it("maps a binding that resolves void to ok", async () => {
    mockImpactFeedback.mockResolvedValue(undefined);
    const provider = await createTauriHapticsProvider(createMockLog());

    const result = await provider.impact("medium");

    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
  });

  it.each(
    CALLS
  )("$method: status 'error' maps to 'error' with the raw payload and is logged", async ({
    method,
    invoke,
    binding
  }) => {
    binding.mockResolvedValue({ status: "error", error: "haptics plugin not initialized" });
    const log = createMockLog();
    const provider = await createTauriHapticsProvider(log);

    const result = await invoke(provider);

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "haptics plugin not initialized"
    });
    expect(log.error).toHaveBeenCalledExactlyOnceWith("haptics:tauri-failed", { method });
  });

  it.each(CALLS)("$method: a thrown Error maps to 'error', never 'denied', and is logged", async ({
    method,
    invoke,
    binding
  }) => {
    binding.mockRejectedValue(new Error("haptics.impact_feedback not allowed by ACL"));
    const log = createMockLog();
    const provider = await createTauriHapticsProvider(log);

    const result = await invoke(provider);

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "haptics.impact_feedback not allowed by ACL"
    });
    expect(log.error).toHaveBeenCalledExactlyOnceWith(
      "haptics:tauri-failed",
      { method },
      expect.any(Error)
    );
  });

  it("wraps a non-Error rejection into an Error for log.error and keeps its text", async () => {
    mockSelectionFeedback.mockRejectedValue("ipc channel closed");
    const log = createMockLog();
    const provider = await createTauriHapticsProvider(log);

    const result = await provider.selection();

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "ipc channel closed"
    });
    const loggedError = vi.mocked(log.error).mock.calls[0]?.[2];
    expect(loggedError).toBeInstanceOf(Error);
    expect(loggedError?.message).toBe("ipc channel closed");
  });

  it("dispose resolves without calling any binding", async () => {
    const provider = await createTauriHapticsProvider(createMockLog());

    await expect(provider.dispose()).resolves.toBeUndefined();
    expect(mockImpactFeedback).not.toHaveBeenCalled();
    expect(mockNotificationFeedback).not.toHaveBeenCalled();
    expect(mockSelectionFeedback).not.toHaveBeenCalled();
  });
});
