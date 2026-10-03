import { afterEach, describe, expect, it, vi } from "vitest";

// The app never installed @tauri-apps/api: importing the event module rejects. Kept in its
// own file because a module mock is per file, and the other Tauri tests need a working one.
vi.mock("@tauri-apps/api/event", () => {
  throw new Error("Cannot find package '@tauri-apps/api' imported from providers/tauri.ts");
});

import { createTauriLifecycleProvider } from "../../providers/tauri";
import { createFakeDocument, createMockLog } from "./test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createTauriLifecycleProvider — @tauri-apps/api missing", () => {
  it("only warns: the provider resolves and the visibility source still works", async () => {
    const doc = createFakeDocument();
    vi.stubGlobal("document", doc);
    const log = createMockLog();
    const signal = vi.fn();

    const provider = await createTauriLifecycleProvider(log, signal);
    doc.setVisibility("hidden");

    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith("lifecycle:tauri-events-unavailable", {
      message: expect.any(String)
    });
    expect(signal).toHaveBeenCalledWith("pause");

    await provider.dispose();
    expect(doc.listenerCount()).toBe(0);
  });
});
