import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUnlisten, mockOnOpenUrl, mockGetCurrent } = vi.hoisted(() => {
  const mockUnlisten = vi.fn();
  const mockOnOpenUrl = vi.fn(async () => mockUnlisten);
  // eslint-disable-next-line unicorn/no-null -- default mock: no launch URLs reported
  const mockGetCurrent = vi.fn(async () => null as string[] | null);
  return { mockUnlisten, mockOnOpenUrl, mockGetCurrent };
});

vi.mock("@tauri-apps/plugin-deep-link", () => ({
  getCurrent: mockGetCurrent,
  onOpenUrl: mockOnOpenUrl
}));

import { loadDeepLinkProvider } from "../../providers/index";
import type { DeepLinkContext, DeepLinkState } from "../../types";
import { createMockLog } from "./test-helpers";

beforeEach(() => {
  mockGetCurrent.mockClear();
  // eslint-disable-next-line unicorn/no-null -- default mock: no launch URLs reported
  mockGetCurrent.mockImplementation(async () => null);
  mockOnOpenUrl.mockClear();
  mockOnOpenUrl.mockImplementation(async () => mockUnlisten);
  mockUnlisten.mockClear();
});

const createMockCtx = (overrides?: Partial<DeepLinkContext>): DeepLinkContext => ({
  config: { schemes: [], ...overrides?.config },
  state:
    overrides?.state ??
    ({
      // eslint-disable-next-line unicorn/no-null -- DeepLinkState.provider is typed `Promise<...> | null` (seam contract)
      provider: null,
      handedOver: new Map(),
      launchPhaseOpen: true,
      // eslint-disable-next-line unicorn/no-null -- the deadline is unknown until the first launch-phase URL
      launchPhaseEndsAt: null,
      subscribers: new Set()
    } satisfies DeepLinkState),
  emit: overrides?.emit ?? vi.fn(),
  global: overrides?.global ?? {},
  runtime: overrides?.runtime ?? { kind: "web", platform: "unknown" },
  log: overrides?.log ?? createMockLog()
});

describe("loadDeepLinkProvider", () => {
  it("selects the Tauri provider when ctx.runtime.kind is 'tauri' and wires onUrl to onOpenUrl", async () => {
    const ctx = createMockCtx({ runtime: { kind: "tauri", platform: "macos" } });
    const onUrl = vi.fn();

    const load = loadDeepLinkProvider(ctx, onUrl);
    const provider = await load();

    expect(mockOnOpenUrl).toHaveBeenCalledTimes(1);
    const result = await provider.getCurrent();
    expect(result.provider).toBe("tauri");
  });

  it("selects the web provider when ctx.runtime.kind is 'web' and never touches the Tauri module", async () => {
    const ctx = createMockCtx({ runtime: { kind: "web", platform: "unknown" } });
    const onUrl = vi.fn();

    const load = loadDeepLinkProvider(ctx, onUrl);
    const provider = await load();

    expect(mockOnOpenUrl).not.toHaveBeenCalled();
    const result = await provider.getCurrent();
    expect(result.provider).toBe("web");
  });
});
