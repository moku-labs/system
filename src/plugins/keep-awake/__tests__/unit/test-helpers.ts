import type { ExpectChain, LogApi, LogEntry } from "@moku-labs/common";
import type { Mock } from "vitest";
import { vi } from "vitest";

/**
 * Minimal LogApi test double. `warn` and `error` are exercised by the provider tests; the
 * remaining members are typed stubs so the mock satisfies LogApi without casts.
 */
export function createMockLog(): LogApi {
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

/** Page visibility as the fake document reports it. */
export type Visibility = "visible" | "hidden";

/**
 * Fake WakeLockSentinel. `release()` and a browser drop both fire the "release" listeners, once.
 */
export type FakeSentinel = {
  readonly release: Mock<() => Promise<void>>;
  readonly addEventListener: (type: "release", listener: () => void) => void;
  /** Simulates the browser dropping the lock, as it does when the page hides. */
  readonly drop: () => void;
};

/** Fake `navigator.wakeLock`: every request hands out a fresh sentinel and records it. */
export type FakeWakeLock = {
  readonly request: Mock<(type: "screen") => Promise<FakeSentinel>>;
  readonly sentinels: FakeSentinel[];
};

/** Fake `document`: a mutable visibility state plus a recorded listener set. */
export type FakeDocument = {
  visibilityState: Visibility;
  readonly listeners: Set<() => void>;
  readonly addEventListener: Mock<(type: string, listener: () => void) => void>;
  readonly removeEventListener: Mock<(type: string, listener: () => void) => void>;
};

export function createFakeSentinel(): FakeSentinel {
  const listeners: Array<() => void> = [];
  let released = false;

  const fireRelease = (): void => {
    if (released) return;
    released = true;
    for (const listener of listeners) listener();
  };

  return {
    release: vi.fn(async () => {
      fireRelease();
    }),
    addEventListener: (_type, listener) => {
      listeners.push(listener);
    },
    drop: fireRelease
  };
}

export function createFakeWakeLock(): FakeWakeLock {
  const sentinels: FakeSentinel[] = [];
  const request = vi.fn(async (_type: "screen") => {
    const sentinel = createFakeSentinel();
    sentinels.push(sentinel);
    return sentinel;
  });
  return { request, sentinels };
}

export function createFakeDocument(visibilityState: Visibility = "visible"): FakeDocument {
  const listeners = new Set<() => void>();
  return {
    visibilityState,
    listeners,
    addEventListener: vi.fn((_type: string, listener: () => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: () => void) => {
      listeners.delete(listener);
    })
  };
}

/** Flips the fake document's visibility and dispatches `visibilitychange`. */
export function changeVisibility(fakeDocument: FakeDocument, visibility: Visibility): void {
  fakeDocument.visibilityState = visibility;
  for (const listener of fakeDocument.listeners) listener();
}

/** Stubs `navigator.wakeLock` and `document` with fresh fakes and returns both. */
export function installWakeLock(visibility: Visibility = "visible"): {
  wakeLock: FakeWakeLock;
  fakeDocument: FakeDocument;
} {
  const wakeLock = createFakeWakeLock();
  const fakeDocument = createFakeDocument(visibility);
  vi.stubGlobal("navigator", { wakeLock });
  vi.stubGlobal("document", fakeDocument);
  return { wakeLock, fakeDocument };
}

/** Lets every queued microtask and the next macrotask run. */
export function flushAsync(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}
