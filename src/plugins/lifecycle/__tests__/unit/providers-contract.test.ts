import { afterEach, describe, expect, it, vi } from "vitest";

const { mockListen } = vi.hoisted(() => ({
  mockListen: vi.fn(async (_event: string, _handler: () => void) => vi.fn())
}));

vi.mock("@tauri-apps/api/event", () => ({ listen: mockListen }));

import { createTauriLifecycleProvider } from "../../providers/tauri";
import type { LifecycleProvider, LifecycleSignal } from "../../providers/types";
import { createWebLifecycleProvider } from "../../providers/web";
import { createFakeDocument, createMockLog } from "./test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each<{
  kind: "web" | "tauri";
  createProvider: (signal: LifecycleSignal) => Promise<LifecycleProvider>;
}>([
  { kind: "web", createProvider: signal => createWebLifecycleProvider(signal) },
  { kind: "tauri", createProvider: signal => createTauriLifecycleProvider(createMockLog(), signal) }
])("provider parity: $kind", ({ createProvider }) => {
  it("exposes dispose() and nothing else", async () => {
    const provider = await createProvider(vi.fn());

    expect(Object.keys(provider)).toEqual(["dispose"]);
    expect(typeof provider.dispose).toBe("function");
  });

  it("dispose resolves undefined, also when called twice", async () => {
    const provider = await createProvider(vi.fn());

    await expect(provider.dispose()).resolves.toBeUndefined();
    await expect(provider.dispose()).resolves.toBeUndefined();
  });

  it("reports pause for a page hidden at creation (the shared visibility source)", async () => {
    vi.stubGlobal("document", createFakeDocument("hidden"));
    const signal = vi.fn();

    await createProvider(signal);

    expect(signal.mock.calls).toEqual([["pause"]]);
  });

  it("dispose removes the visibilitychange listener", async () => {
    const doc = createFakeDocument();
    vi.stubGlobal("document", doc);
    const provider = await createProvider(vi.fn());

    await provider.dispose();

    expect(doc.listenerCount()).toBe(0);
  });
});
