/* eslint-disable unicorn/no-null -- ResolutionState.provider is typed `Promise<...> | null` per the
   seam contract (spec/01-runtime.md); these tests construct that state shape directly. */
import { describe, expect, it, vi } from "vitest";
import type { CapabilityProvider, ResolutionState } from "../../provider";
import { awaitProvider, startResolution, stopResolution } from "../../provider";

type FakeProvider = CapabilityProvider & { readonly id: string };

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

describe("startResolution", () => {
  it("synchronously stores an unawaited promise on state.provider", () => {
    const state: ResolutionState<FakeProvider> = { provider: null };
    startResolution("store", "web", { global: {}, state }, () =>
      Promise.resolve(createFakeProvider("p1"))
    );
    expect(state.provider).not.toBeNull();
    expect(state.provider).toBeInstanceOf(Promise);
  });

  it("resolves ok:true with the loaded provider on success", async () => {
    const state: ResolutionState<FakeProvider> = { provider: null };
    const provider = createFakeProvider("p1");
    startResolution("store", "web", { global: {}, state }, () => Promise.resolve(provider));
    await expect(state.provider).resolves.toEqual({ ok: true, provider });
  });

  it("folds a load() rejection into an unavailable failure instead of throwing", async () => {
    const state: ResolutionState<FakeProvider> = { provider: null };
    expect(() =>
      startResolution("store", "web", { global: {}, state }, () =>
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
    startResolution("store", "web", { global, state }, load);
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
    startResolution("store", "web", { global, state }, () =>
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
      { global, state },
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
      { global, state },
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

describe("per-app isolation", () => {
  it("keeps two distinct frozen global objects as independent registry entries", async () => {
    const globalA = Object.freeze({ id: "a" });
    const globalB = Object.freeze({ id: "b" });
    const stateA: ResolutionState<FakeProvider> = { provider: null };
    const stateB: ResolutionState<FakeProvider> = { provider: null };
    const disposeA = vi.fn(() => Promise.resolve());
    const disposeB = vi.fn(() => Promise.resolve());

    startResolution("store", "web", { global: globalA, state: stateA }, () =>
      Promise.resolve(createFakeProvider("a", disposeA))
    );
    startResolution("store", "web", { global: globalB, state: stateB }, () =>
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
    startResolution("store", "web", { global: {}, state }, () =>
      Promise.resolve(createFakeProvider("p1"))
    );

    const resolved = await awaitProvider(state, "web");

    expect(resolved.ok).toBe(true);
  });
});
