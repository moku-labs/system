import "fake-indexeddb/auto";

import { describe, expect, it, vi } from "vitest";

// A dedicated file (not store.test.ts) because vi.mock("idb-keyval") is file-scoped —
// stalling `set` here would deadlock the other integration file's real round-trip ops.
// The stall targets the web provider's one-time write-probe (`set` then `del`), which
// startResolution's load() is awaiting — so resolution is still in flight when the test
// calls app.stop().
const { releaseProbe, probeGate } = vi.hoisted(() => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  return {
    releaseProbe: () => release?.(),
    probeGate: gate
  };
});

vi.mock("idb-keyval", async importOriginal => {
  const actual = await importOriginal<typeof import("idb-keyval")>();
  return {
    ...actual,
    set: async (...args: Parameters<typeof actual.set>): ReturnType<typeof actual.set> => {
      await probeGate;
      return actual.set(...args);
    }
  };
});

import { createApp } from "../../../../index";
import { storePlugin } from "../../index";

describe("store plugin: stop during resolution", () => {
  it("disposes a late-arriving provider and folds resolution to 'unavailable' when app.stop() runs first", async () => {
    const app = createApp({
      plugins: [storePlugin],
      pluginConfigs: { store: { name: "slow-resolution-db" } }
    });

    // onStart fires startResolution synchronously (fire-and-forget) and does not await
    // it, so app.start() resolves immediately even though the web provider's write-probe
    // is stalled on probeGate below.
    await app.start();

    // Calling app.stop() executes stopResolution's body synchronously up to its first
    // internal await — `entry.stopped = true` is set before this statement returns
    // control, i.e. strictly before the stalled resolution is allowed to continue.
    const stopPromise = app.stop();

    // Let the stalled write-probe (and the rest of provider construction) proceed. Once
    // it settles, startResolution's `.then` sees entry.stopped and disposes the
    // late-arriving provider instead of installing it.
    releaseProbe();
    await stopPromise;

    // awaitProvider (called internally by every API method) awaits the exact same
    // ctx.state.provider promise, so this deterministically observes the post-dispose,
    // stopped-during-resolution outcome — the only code path that produces this message
    // is the one that has already awaited provider.dispose() (see runtime/provider.ts).
    const result = await app.store.get("k");

    expect(result).toEqual({
      ok: false,
      provider: "web",
      reason: "unavailable",
      message: "stopped during resolution"
    });

    // The resolution promise is now settled — a second call observes the identical,
    // already-folded failure rather than re-entering resolution.
    const secondResult = await app.store.get("k");
    expect(secondResult).toEqual(result);
  });
});
