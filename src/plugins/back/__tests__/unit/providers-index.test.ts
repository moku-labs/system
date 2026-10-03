import { beforeEach, describe, expect, it, vi } from "vitest";

// force-testing rule: forcing kind "tauri" is paired with vi.mock of
// @tauri-apps/api/app, so the android branch never reaches a real IPC call.
const { mockOnBackButtonPress, mockExit } = vi.hoisted(() => {
  const mockOnBackButtonPress = vi.fn(async () => ({ unregister: vi.fn(async () => undefined) }));
  const mockExit = vi.fn(async (_code?: number) => undefined);
  return { mockOnBackButtonPress, mockExit };
});

vi.mock("@tauri-apps/api/app", () => ({
  onBackButtonPress: mockOnBackButtonPress,
  exit: mockExit
}));

import type { RuntimePlatform, SystemResult } from "../../../runtime/result";
import { loadBackProvider } from "../../providers/index";
import type { BackProvider } from "../../providers/types";
import { BACK_METHODS } from "../../providers/types";
import { createMockCtx } from "./test-helpers";

const invokers: Record<
  (typeof BACK_METHODS)[number],
  (provider: BackProvider) => Promise<SystemResult<void>>
> = {
  listen: provider => provider.listen(() => true),
  unlisten: provider => provider.unlisten(),
  exit: provider => provider.exit()
};

beforeEach(() => {
  mockOnBackButtonPress.mockClear();
  mockExit.mockClear();
});

describe("loadBackProvider — three-way selection", () => {
  it.each<RuntimePlatform>([
    "android",
    "ios",
    "unknown"
  ])("kind 'web' + platform '%s' selects the all-unsupported web provider", async platform => {
    const provider = await loadBackProvider(
      createMockCtx({ runtime: { kind: "web", platform } })
    )();

    for (const method of BACK_METHODS) {
      const result = await invokers[method](provider);
      expect(result).toEqual({ ok: false, provider: "web", reason: "unsupported" });
    }
    expect(mockOnBackButtonPress).not.toHaveBeenCalled();
  });

  it.each<RuntimePlatform>([
    "ios",
    "macos",
    "windows",
    "linux",
    "unknown"
  ])("kind 'tauri' + platform '%s' selects the all-unsupported tauri provider (Android only, D-S05)", async platform => {
    const provider = await loadBackProvider(
      createMockCtx({ runtime: { kind: "tauri", platform } })
    )();

    for (const method of BACK_METHODS) {
      const result = await invokers[method](provider);
      expect(result).toEqual({ ok: false, provider: "tauri", reason: "unsupported" });
    }
    expect(mockOnBackButtonPress).not.toHaveBeenCalled();
    expect(mockExit).not.toHaveBeenCalled();
  });

  it("kind 'tauri' + platform 'android' selects the real Tauri provider", async () => {
    const provider = await loadBackProvider(
      createMockCtx({ runtime: { kind: "tauri", platform: "android" } })
    )();

    const listened = await provider.listen(() => true);
    const exited = await provider.exit();

    expect(listened).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(exited).toEqual({ ok: true, value: undefined, provider: "tauri" });
    expect(mockOnBackButtonPress).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("selection registers nothing: the android provider listens only when asked", async () => {
    await loadBackProvider(createMockCtx({ runtime: { kind: "tauri", platform: "android" } }))();

    expect(mockOnBackButtonPress).not.toHaveBeenCalled();
  });
});
