import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUnlisten, mockOnOpenUrl, mockGetCurrent } = vi.hoisted(() => {
  const mockUnlisten = vi.fn();
  const mockOnOpenUrl = vi.fn(async () => mockUnlisten);
  // eslint-disable-next-line unicorn/no-null -- default mock: overridden per-test via mockImplementation
  const mockGetCurrent = vi.fn(async () => null as string[] | null);
  return { mockUnlisten, mockOnOpenUrl, mockGetCurrent };
});

vi.mock("@tauri-apps/plugin-deep-link", () => ({
  getCurrent: mockGetCurrent,
  onOpenUrl: mockOnOpenUrl
}));

import type { RuntimeKind } from "../../../runtime/result";
import { createTauriDeepLinkProvider } from "../../providers/tauri";
import type { DeepLinkProvider } from "../../providers/types";
import { createWebDeepLinkProvider } from "../../providers/web";
import { createMockLog } from "./test-helpers";

beforeEach(() => {
  mockGetCurrent.mockClear();
  mockGetCurrent.mockImplementation(async () => ["myapp://parity"]);
  mockOnOpenUrl.mockClear();
  mockOnOpenUrl.mockImplementation(async () => mockUnlisten);
  mockUnlisten.mockClear();
});

describe.each<{ kind: RuntimeKind; createProvider: () => Promise<DeepLinkProvider> }>([
  {
    kind: "web",
    createProvider: () => createWebDeepLinkProvider({ schemes: [] }, createMockLog())
  },
  {
    kind: "tauri",
    createProvider: () => createTauriDeepLinkProvider({ schemes: [] }, createMockLog(), vi.fn())
  }
])("provider parity: $kind", ({ kind, createProvider }) => {
  it("satisfies the structural DeepLinkProvider contract", async () => {
    const provider = await createProvider();

    expect(typeof provider.getCurrent).toBe("function");
    expect(typeof provider.dispose).toBe("function");
  });

  it("getCurrent resolves to an ok SystemResult tagged with its own provider kind", async () => {
    const provider = await createProvider();

    const result = await provider.getCurrent();

    expect(result.ok).toBe(true);
    expect(result.provider).toBe(kind);
  });

  it("dispose resolves without throwing", async () => {
    const provider = await createProvider();

    await expect(provider.dispose()).resolves.toBeUndefined();
  });
});
