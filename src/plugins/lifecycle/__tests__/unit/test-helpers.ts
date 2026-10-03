import type { ExpectChain, LogApi, LogEntry } from "@moku-labs/common";
import { vi } from "vitest";

import type { RuntimeApi } from "../../../runtime/types";
import type { LifecycleContext, LifecycleState } from "../../types";

/**
 * Minimal LogApi test double. `warn` and `error` are exercised by the provider and signal
 * tests; the remaining members are typed stubs so the mock structurally satisfies LogApi
 * without casts (R7/R9 — no `as any`, no lazy `unknown`).
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

/** A fresh lifecycle state, built here so the tests do not depend on createLifecycleState. */
export function createTestState(): LifecycleState {
  return {
    // eslint-disable-next-line unicorn/no-null -- LifecycleState.provider is typed `Promise<...> | null` (seam contract)
    provider: null,
    paused: false,
    pauseSubscribers: new Set(),
    resumeSubscribers: new Set()
  };
}

/** A lifecycle domain context with a fresh state and a mock log. */
export function createMockCtx(overrides?: {
  runtime?: RuntimeApi;
  state?: LifecycleState;
  log?: LogApi;
}): LifecycleContext {
  return {
    config: {},
    state: overrides?.state ?? createTestState(),
    emit: vi.fn(),
    global: {},
    runtime: overrides?.runtime ?? { kind: "web", platform: "unknown" },
    log: overrides?.log ?? createMockLog()
  };
}

/** The two values the tests put in `document.visibilityState`. */
export type TestVisibility = "visible" | "hidden";

/**
 * Fake `document`: only what the visibility source reads, plus test controls. Listeners live
 * in a Set, so adding the same listener twice keeps one, as the DOM does.
 */
export type FakeDocument = {
  visibilityState: TestVisibility;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  /** Set the state, then fire `visibilitychange`, as a browser does on a tab switch. */
  setVisibility: (state: TestVisibility) => void;
  /** How many `visibilitychange` listeners are attached right now. */
  listenerCount: () => number;
};

/** Build a fake document in the given visibility state (default: visible). */
export function createFakeDocument(initial: TestVisibility = "visible"): FakeDocument {
  const listeners = new Set<() => void>();

  const fake: FakeDocument = {
    visibilityState: initial,
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === "visibilitychange") {
        listeners.add(listener);
      }
    }),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === "visibilitychange") {
        listeners.delete(listener);
      }
    }),
    setVisibility: (state: TestVisibility) => {
      fake.visibilityState = state;
      for (const listener of listeners) {
        listener();
      }
    },
    listenerCount: () => listeners.size
  };

  return fake;
}
