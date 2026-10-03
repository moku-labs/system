import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// One handler and one unlisten spy per native event name, so a test can fire an OS event
// and check that dispose removed exactly that listener.
const { mockListen, listenImpl, nativeHandlers, nativeUnlisteners } = vi.hoisted(() => {
  const nativeHandlers = new Map<string, () => void>();
  const nativeUnlisteners = new Map<string, ReturnType<typeof vi.fn>>();
  const listenImpl = async (event: string, handler: () => void): Promise<() => void> => {
    nativeHandlers.set(event, handler);
    const unlisten = vi.fn();
    nativeUnlisteners.set(event, unlisten);
    return unlisten;
  };
  return { mockListen: vi.fn(listenImpl), listenImpl, nativeHandlers, nativeUnlisteners };
});

vi.mock("@tauri-apps/api/event", () => ({ listen: mockListen }));

import { createSignal } from "../../api";
import { createTauriLifecycleProvider } from "../../providers/tauri";
import { createFakeDocument, createMockCtx, createMockLog } from "./test-helpers";

const SUSPENDED = "tauri://suspended";
const RESUMED = "tauri://resumed";

/** Make every native listener return the given unlisten. */
function useUnlisten(unlisten: () => Promise<void>): void {
  mockListen.mockImplementation(async (event: string, handler: () => void) => {
    nativeHandlers.set(event, handler);
    return unlisten;
  });
}

/** Let Node run its unhandled-rejection check (it runs after the microtask queue). */
async function flushMacrotask(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  nativeHandlers.clear();
  nativeUnlisteners.clear();
  mockListen.mockReset().mockImplementation(listenImpl);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createTauriLifecycleProvider", () => {
  it("listens to the native suspend/resume events under the names @tauri-apps/api ships", async () => {
    const actual = await vi.importActual<{
      TauriEvent: { WINDOW_SUSPENDED: string; WINDOW_RESUMED: string };
    }>("@tauri-apps/api/event");

    await createTauriLifecycleProvider(createMockLog(), vi.fn());

    expect(actual.TauriEvent.WINDOW_SUSPENDED).toBe(SUSPENDED);
    expect(actual.TauriEvent.WINDOW_RESUMED).toBe(RESUMED);
    expect(mockListen).toHaveBeenCalledTimes(2);
    expect(mockListen).toHaveBeenCalledWith(SUSPENDED, expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith(RESUMED, expect.any(Function));
  });

  it("tauri://suspended reports pause, tauri://resumed reports resume", async () => {
    const signal = vi.fn();
    await createTauriLifecycleProvider(createMockLog(), signal);

    nativeHandlers.get(SUSPENDED)?.();
    nativeHandlers.get(RESUMED)?.();

    expect(signal.mock.calls).toEqual([["pause"], ["resume"]]);
  });

  it("also watches visibility: hidden → pause, visible → resume", async () => {
    const doc = createFakeDocument();
    vi.stubGlobal("document", doc);
    const signal = vi.fn();
    await createTauriLifecycleProvider(createMockLog(), signal);

    doc.setVisibility("hidden");
    doc.setVisibility("visible");

    expect(doc.listenerCount()).toBe(1);
    expect(signal.mock.calls).toEqual([["pause"], ["resume"]]);
  });

  it("replays the P15 iOS order through the real signal: exactly one pause and one resume", async () => {
    const doc = createFakeDocument();
    vi.stubGlobal("document", doc);
    const ctx = createMockCtx({ runtime: { kind: "tauri", platform: "ios" } });
    const pauses = vi.fn();
    const resumes = vi.fn();
    ctx.state.pauseSubscribers.add(pauses);
    ctx.state.resumeSubscribers.add(resumes);
    await createTauriLifecycleProvider(ctx.log, createSignal(ctx));
    vi.useFakeTimers();

    // P15: the native suspend arrives first, visibilitychange hidden 1.5 s later.
    setTimeout(() => nativeHandlers.get(SUSPENDED)?.(), 0);
    setTimeout(() => doc.setVisibility("hidden"), 1500);
    // Back in the app: the native resume and visibilitychange visible land within 2 ms.
    setTimeout(() => nativeHandlers.get(RESUMED)?.(), 60_000);
    setTimeout(() => doc.setVisibility("visible"), 60_002);

    vi.advanceTimersByTime(1500);
    expect(pauses).toHaveBeenCalledTimes(1);
    expect(resumes).not.toHaveBeenCalled();

    vi.advanceTimersByTime(58_502);
    expect(pauses).toHaveBeenCalledTimes(1);
    expect(resumes).toHaveBeenCalledTimes(1);
  });

  it("a rejected listen only warns: the provider resolves and visibility keeps working", async () => {
    mockListen.mockRejectedValue(new Error("event.listen not allowed"));
    const doc = createFakeDocument();
    vi.stubGlobal("document", doc);
    const log = createMockLog();
    const signal = vi.fn();

    const provider = await createTauriLifecycleProvider(log, signal);
    doc.setVisibility("hidden");

    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith("lifecycle:tauri-events-unavailable", {
      message: "event.listen not allowed"
    });
    expect(signal).toHaveBeenCalledWith("pause");
    await expect(provider.dispose()).resolves.toBeUndefined();
  });

  it("keeps the native listener that registered when the other one fails, and removes it on dispose", async () => {
    mockListen.mockImplementation(async (event: string, handler: () => void) => {
      if (event === RESUMED) {
        throw new Error("resumed refused");
      }
      return listenImpl(event, handler);
    });
    const log = createMockLog();
    const signal = vi.fn();

    const provider = await createTauriLifecycleProvider(log, signal);
    nativeHandlers.get(SUSPENDED)?.();
    await provider.dispose();

    expect(log.warn).toHaveBeenCalledWith("lifecycle:tauri-events-unavailable", {
      message: "resumed refused"
    });
    expect(signal).toHaveBeenCalledWith("pause");
    expect(nativeUnlisteners.get(SUSPENDED)).toHaveBeenCalledTimes(1);
  });

  it("turns a non-Error rejection into a string message for the warning", async () => {
    mockListen.mockRejectedValue("plain string rejection");
    const log = createMockLog();

    await createTauriLifecycleProvider(log, vi.fn());

    expect(log.warn).toHaveBeenCalledWith("lifecycle:tauri-events-unavailable", {
      message: "plain string rejection"
    });
  });

  it("dispose removes the DOM listener and calls both unlisten functions", async () => {
    const doc = createFakeDocument();
    vi.stubGlobal("document", doc);
    const provider = await createTauriLifecycleProvider(createMockLog(), vi.fn());

    await provider.dispose();

    expect(doc.listenerCount()).toBe(0);
    expect(nativeUnlisteners.get(SUSPENDED)).toHaveBeenCalledTimes(1);
    expect(nativeUnlisteners.get(RESUMED)).toHaveBeenCalledTimes(1);
  });

  it("dispose is idempotent: each unlisten runs once", async () => {
    const provider = await createTauriLifecycleProvider(createMockLog(), vi.fn());

    await provider.dispose();
    await provider.dispose();

    expect(nativeUnlisteners.get(SUSPENDED)).toHaveBeenCalledTimes(1);
    expect(nativeUnlisteners.get(RESUMED)).toHaveBeenCalledTimes(1);
  });

  describe("dispose with the real @tauri-apps/api 2.x unlisten, which returns a Promise", () => {
    it("a rejected unlisten only warns: dispose resolves and no rejection is left unhandled", async () => {
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      useUnlisten(
        vi.fn(async (): Promise<void> => {
          throw new Error("ipc closed");
        })
      );
      const log = createMockLog();
      const provider = await createTauriLifecycleProvider(log, vi.fn());

      await expect(provider.dispose()).resolves.toBeUndefined();
      await flushMacrotask();
      process.off("unhandledRejection", unhandled);

      expect(unhandled).not.toHaveBeenCalled();
      expect(log.warn).toHaveBeenCalledTimes(2);
      expect(log.warn).toHaveBeenCalledWith("lifecycle:tauri-unlisten-failed", {
        message: "ipc closed"
      });
    });

    it("an unlisten that throws synchronously only warns, and the other unlisten still runs", async () => {
      const throwing = vi.fn((): Promise<void> => {
        throw new Error("sync boom");
      });
      const working = vi.fn(async (): Promise<void> => {});
      mockListen.mockImplementation(async (event: string) =>
        event === SUSPENDED ? throwing : working
      );
      const log = createMockLog();
      const provider = await createTauriLifecycleProvider(log, vi.fn());

      await expect(provider.dispose()).resolves.toBeUndefined();

      expect(throwing).toHaveBeenCalledTimes(1);
      expect(working).toHaveBeenCalledTimes(1);
      expect(log.warn).toHaveBeenCalledTimes(1);
      expect(log.warn).toHaveBeenCalledWith("lifecycle:tauri-unlisten-failed", {
        message: "sync boom"
      });
    });

    it("dispose resolves only after the async native unlisten finished", async () => {
      const pending: Array<() => void> = [];
      const unlisten = vi.fn(
        () =>
          new Promise<void>(resolve => {
            pending.push(resolve);
          })
      );
      useUnlisten(unlisten);
      const provider = await createTauriLifecycleProvider(createMockLog(), vi.fn());
      const order: string[] = [];

      const disposing = provider.dispose().then(() => order.push("disposed"));
      await flushMacrotask();
      order.push("unlisten finished");
      for (const finishUnlisten of pending) {
        finishUnlisten();
      }
      await disposing;

      expect(unlisten).toHaveBeenCalledTimes(2);
      expect(order).toEqual(["unlisten finished", "disposed"]);
    });

    it("a second dispose does nothing: no unlisten call and no warning", async () => {
      const unlisten = vi.fn(async (): Promise<void> => {
        throw new Error("ipc closed");
      });
      useUnlisten(unlisten);
      const log = createMockLog();
      const provider = await createTauriLifecycleProvider(log, vi.fn());

      await provider.dispose();
      await provider.dispose();

      expect(unlisten).toHaveBeenCalledTimes(2);
      expect(log.warn).toHaveBeenCalledTimes(2);
    });
  });
});
