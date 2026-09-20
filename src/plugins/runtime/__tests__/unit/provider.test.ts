/* eslint-disable unicorn/no-null -- ResolutionState.provider is typed `Promise<...> | null` per the
   seam contract (spec/01-runtime.md); these tests construct that state shape directly. */
import type { ExpectChain, LogApi, LogEntry } from "@moku-labs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CapabilityProvider, ResolutionState } from "../../provider";
import { awaitProvider, requirePeer, startResolution, stopResolution } from "../../provider";

type FakeProvider = CapabilityProvider & { readonly id: string };

/**
 * Test helper — a minimal LogApi double. Teardown has no ctx.log of its own, so the
 * seam keeps the one handed to startResolution; these tests assert on it.
 */
function createMockLog(): LogApi {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: (): readonly LogEntry[] => [],
    expect: (): ExpectChain => {
      throw new Error("ExpectChain is not mocked — these tests do not use log.expect()");
    },
    addSink: vi.fn(),
    reset: vi.fn(),
    clearSinks: vi.fn()
  };
}

/** Test helper — the onStart context slice startResolution consumes. */
function createStartCtx<P extends CapabilityProvider>(
  state: ResolutionState<P>,
  global: object = {},
  log: LogApi = createMockLog()
): { readonly global: object; state: ResolutionState<P>; readonly log: LogApi } {
  return { global, state, log };
}

/**
 * Test helper — builds a fake capability provider with a spy-able dispose.
 */
function createFakeProvider(id: string, dispose = vi.fn(() => Promise.resolve())): FakeProvider {
  return { id, dispose };
}

/**
 * Test helper — a promise that settles one macrotask later, i.e. strictly after every
 * pending microtask has drained.
 */
function nextMacrotask(): Promise<void> {
  return new Promise<void>(resolve => {
    setTimeout(resolve, 0);
  });
}

/**
 * Test helper — a load() that stays pending until `arrive` is called, standing in for a
 * dynamic import that stalls past teardown.
 */
function createStalledLoad(): {
  load: () => Promise<FakeProvider>;
  arrive: (provider: FakeProvider) => void;
} {
  let settle: ((provider: FakeProvider) => void) | undefined;
  const pending = new Promise<FakeProvider>(resolve => {
    settle = resolve;
  });
  return {
    load: (): Promise<FakeProvider> => pending,
    arrive: (provider: FakeProvider): void => settle?.(provider)
  };
}

describe("startResolution", () => {
  it("synchronously stores an unawaited promise on state.provider", () => {
    const state: ResolutionState<FakeProvider> = { provider: null };
    startResolution("store", "web", createStartCtx(state), () =>
      Promise.resolve(createFakeProvider("p1"))
    );
    expect(state.provider).not.toBeNull();
    expect(state.provider).toBeInstanceOf(Promise);
  });

  it("resolves ok:true with the loaded provider on success", async () => {
    const state: ResolutionState<FakeProvider> = { provider: null };
    const provider = createFakeProvider("p1");
    startResolution("store", "web", createStartCtx(state), () => Promise.resolve(provider));
    await expect(state.provider).resolves.toEqual({ ok: true, provider });
  });

  it("folds a load() rejection into an unavailable failure instead of throwing", async () => {
    const state: ResolutionState<FakeProvider> = { provider: null };
    expect(() =>
      startResolution("store", "web", createStartCtx(state), () =>
        Promise.reject(new Error("boom"))
      )
    ).not.toThrow();
    await expect(state.provider).resolves.toEqual({
      ok: false,
      failure: { ok: false, provider: "web", reason: "unavailable", message: "boom" }
    });
  });

  it("disposes a late-arriving provider and yields a stopped failure when stopped mid-resolution", async () => {
    const state: ResolutionState<FakeProvider> = { provider: null };
    const global = {};
    let resolveLoad: ((provider: FakeProvider) => void) | undefined;
    const load = () =>
      new Promise<FakeProvider>(resolve => {
        resolveLoad = resolve;
      });
    startResolution("store", "web", createStartCtx(state, global), load);
    // stopResolution runs synchronously up to its first await, so the sentinel is set
    // before the load below completes — and it stays pending until teardown finished.
    const stopped = stopResolution("store", { global });

    const dispose = vi.fn(() => Promise.resolve());
    resolveLoad?.(createFakeProvider("late", dispose));
    await stopped;

    await expect(state.provider).resolves.toEqual({
      ok: false,
      failure: {
        ok: false,
        provider: "web",
        reason: "unavailable",
        message: "stopped during resolution"
      }
    });
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe("stopResolution", () => {
  it("flips the stopped sentinel and awaits the resolved provider's dispose", async () => {
    const state: ResolutionState<FakeProvider> = { provider: null };
    const global = {};
    const dispose = vi.fn(() => Promise.resolve());
    startResolution("store", "web", createStartCtx(state, global), () =>
      Promise.resolve(createFakeProvider("p1", dispose))
    );
    await state.provider;

    await stopResolution("store", { global });

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when no entry is registered for the capability", async () => {
    await expect(stopResolution("nonexistent", { global: {} })).resolves.toBeUndefined();
  });

  it("resolves only after an in-flight resolution disposed its late-arriving provider", async () => {
    const state: ResolutionState<FakeProvider> = { provider: null };
    const global = {};
    let resolveLoad: ((provider: FakeProvider) => void) | undefined;
    startResolution(
      "store",
      "web",
      createStartCtx(state, global),
      () =>
        new Promise<FakeProvider>(resolve => {
          resolveLoad = resolve;
        })
    );

    // dispose finishes a macrotask later, so "only after" is an ordering fact here and
    // not a microtask-scheduling coincidence.
    const order: string[] = [];
    const dispose = vi.fn(async (): Promise<void> => {
      await nextMacrotask();
      order.push("disposed");
    });
    // stopResolution runs synchronously up to its first await, so the stopped sentinel is
    // already set when the load below completes — the resolution is genuinely in flight.
    const stopped = stopResolution("store", { global }).then(() => order.push("stopped"));
    resolveLoad?.(createFakeProvider("late", dispose));
    await stopped;

    expect(order).toEqual(["disposed", "stopped"]);
  });

  it("swallows a load() rejection that is still in flight when stop is called", async () => {
    const state: ResolutionState<FakeProvider> = { provider: null };
    const global = {};
    let rejectLoad: ((error: Error) => void) | undefined;
    startResolution(
      "store",
      "web",
      createStartCtx(state, global),
      () =>
        new Promise<FakeProvider>((_resolve, reject) => {
          rejectLoad = reject;
        })
    );

    const stopped = stopResolution("store", { global });
    rejectLoad?.(new Error("boom"));

    await expect(stopped).resolves.toBeUndefined();
  });
});

describe("stopResolution — bounded wait", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives up on a resolution that never settles instead of hanging app.stop()", async () => {
    vi.useFakeTimers();
    const state: ResolutionState<FakeProvider> = { provider: null };
    const global = {};
    const log = createMockLog();
    const { load } = createStalledLoad();
    startResolution("store", "web", createStartCtx(state, global, log), load);

    let finished = false;
    const stopped = stopResolution("store", { global }).then(() => {
      finished = true;
    });

    await vi.advanceTimersByTimeAsync(4999);
    expect(finished).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(stopped).resolves.toBeUndefined();
    expect(finished).toBe(true);
  });

  it("warns with the capability and the elapsed budget when the wait times out", async () => {
    vi.useFakeTimers();
    const state: ResolutionState<FakeProvider> = { provider: null };
    const global = {};
    const log = createMockLog();
    const { load } = createStalledLoad();
    startResolution("store", "web", createStartCtx(state, global, log), load);

    const stopped = stopResolution("store", { global }, 25);
    await vi.advanceTimersByTimeAsync(25);
    await stopped;

    expect(log.warn).toHaveBeenCalledWith("runtime:stop-resolution-timeout", {
      capability: "store",
      timeoutMs: 25
    });
  });

  it("still disposes a provider that arrives after the wait timed out", async () => {
    vi.useFakeTimers();
    const state: ResolutionState<FakeProvider> = { provider: null };
    const global = {};
    const dispose = vi.fn(() => Promise.resolve());
    const { load, arrive } = createStalledLoad();
    startResolution("store", "web", createStartCtx(state, global), load);

    const stopped = stopResolution("store", { global }, 25);
    await vi.advanceTimersByTimeAsync(25);
    await stopped;
    expect(dispose).not.toHaveBeenCalled();

    arrive(createFakeProvider("late", dispose));

    await expect(state.provider).resolves.toEqual({
      ok: false,
      failure: {
        ok: false,
        provider: "web",
        reason: "unavailable",
        message: "stopped during resolution"
      }
    });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("does not warn — and leaves no pending timer — when the resolution settles in time", async () => {
    vi.useFakeTimers();
    const state: ResolutionState<FakeProvider> = { provider: null };
    const global = {};
    const log = createMockLog();
    startResolution("store", "web", createStartCtx(state, global, log), () =>
      Promise.resolve(createFakeProvider("p1"))
    );
    await state.provider;

    await stopResolution("store", { global });

    expect(log.warn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("requirePeer", () => {
  it("returns the loaded provider untouched when the import resolves", async () => {
    const provider = createFakeProvider("p1");

    const loaded = await requirePeer("store", "@tauri-apps/plugin-store", () =>
      Promise.resolve(provider)
    )();

    expect(loaded).toBe(provider);
  });

  it("names the missing package and its native config.system entry for ERR_MODULE_NOT_FOUND", async () => {
    const missing = Object.assign(new Error("Cannot find package '@tauri-apps/plugin-store'"), {
      code: "ERR_MODULE_NOT_FOUND"
    });

    await expect(
      requirePeer("store", "@tauri-apps/plugin-store", () => Promise.reject(missing))()
    ).rejects.toThrow(
      '@tauri-apps/plugin-store is not installed. Add it to the app, or list "store" in @moku-labs/native config.system.'
    );
  });

  it("folds a bundler's unresolvable-specifier rejection into the same named message", async () => {
    const bundlerFailure = new Error(
      "Failed to fetch dynamically imported module: /node_modules/@tauri-apps/plugin-notification"
    );

    await expect(
      requirePeer("notification", "@tauri-apps/plugin-notification", () =>
        Promise.reject(bundlerFailure)
      )()
    ).rejects.toThrow(
      '@tauri-apps/plugin-notification is not installed. Add it to the app, or list "notification" in @moku-labs/native config.system.'
    );
  });

  it("folds a non-Error rejection that still reads as a missing module", async () => {
    await expect(
      requirePeer("tray", "@tauri-apps/api", () => Promise.reject("Module not found: tray"))()
    ).rejects.toThrow("@tauri-apps/api is not installed.");
  });

  it("looks through a module runner's own wrapper error at the cause underneath", async () => {
    const wrapped = new Error("[runner] there was an error when loading a module", {
      cause: Object.assign(new Error("Cannot find package '@tauri-apps/plugin-deep-link'"), {
        code: "ERR_MODULE_NOT_FOUND"
      })
    });

    await expect(
      requirePeer("deep-link", "@tauri-apps/plugin-deep-link", () => Promise.reject(wrapped))()
    ).rejects.toThrow(
      '@tauri-apps/plugin-deep-link is not installed. Add it to the app, or list "deep-link" in @moku-labs/native config.system.'
    );
  });

  it("rethrows a fault raised inside a module that did load", async () => {
    const providerFault = new Error("plugin not registered");

    await expect(
      requirePeer("store", "@tauri-apps/plugin-store", () => Promise.reject(providerFault))()
    ).rejects.toThrow(providerFault);
  });
});

describe("per-app isolation", () => {
  it("keeps two distinct frozen global objects as independent registry entries", async () => {
    const globalA = Object.freeze({ id: "a" });
    const globalB = Object.freeze({ id: "b" });
    const stateA: ResolutionState<FakeProvider> = { provider: null };
    const stateB: ResolutionState<FakeProvider> = { provider: null };
    const disposeA = vi.fn(() => Promise.resolve());
    const disposeB = vi.fn(() => Promise.resolve());

    startResolution("store", "web", createStartCtx(stateA, globalA), () =>
      Promise.resolve(createFakeProvider("a", disposeA))
    );
    startResolution("store", "web", createStartCtx(stateB, globalB), () =>
      Promise.resolve(createFakeProvider("b", disposeB))
    );
    await stateA.provider;
    await stateB.provider;

    await stopResolution("store", { global: globalA });

    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(disposeB).not.toHaveBeenCalled();
  });
});

describe("awaitProvider", () => {
  it("resolves to an 'app not started' failure when state.provider is null", async () => {
    const state: ResolutionState<FakeProvider> = { provider: null };
    await expect(awaitProvider(state, "web")).resolves.toEqual({
      ok: false,
      failure: {
        ok: false,
        provider: "web",
        reason: "unavailable",
        message: "app not started — call app.start() first"
      }
    });
  });

  it("returns the stored resolution promise once resolution has started", async () => {
    const state: ResolutionState<FakeProvider> = { provider: null };
    startResolution("store", "web", createStartCtx(state), () =>
      Promise.resolve(createFakeProvider("p1"))
    );

    const resolved = await awaitProvider(state, "web");

    expect(resolved.ok).toBe(true);
  });
});
