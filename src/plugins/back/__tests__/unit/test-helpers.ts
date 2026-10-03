import type { ExpectChain, LogApi, LogEntry } from "@moku-labs/common";
import { vi } from "vitest";

import type { ResolvedProvider } from "../../../runtime/provider";
import { ok } from "../../../runtime/result";
import type { BackProvider } from "../../providers/types";
import type { BackContext, BackState } from "../../types";

/**
 * Minimal LogApi test double. `error` and `warn` are exercised by the dispatch, reconcile
 * and provider tests; the remaining members are typed stubs so the mock structurally
 * satisfies LogApi without casts (R7/R9 — no `as any`, no lazy `unknown`).
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

/** A fresh, not-started back state (provider null, no handlers, idle queue). */
export function createTestState(overrides?: Partial<BackState>): BackState {
  return {
    // eslint-disable-next-line unicorn/no-null -- BackState.provider is typed `Promise<...> | null` (seam contract)
    provider: null,
    handlers: [],
    listening: false,
    queue: Promise.resolve(),
    ...overrides
  };
}

/** A resolved-ok resolution slot holding `provider`. */
export function resolvedWith(provider: BackProvider): Promise<ResolvedProvider<BackProvider>> {
  return Promise.resolve({ ok: true, provider });
}

/** A back domain context over a not-started state, on web unless overridden. */
export function createMockCtx(overrides?: Partial<BackContext>): BackContext {
  return {
    config: {},
    state: overrides?.state ?? createTestState(),
    emit: vi.fn(),
    global: {},
    runtime: overrides?.runtime ?? { kind: "web", platform: "unknown" },
    log: overrides?.log ?? createMockLog()
  };
}

/** A fake Tauri provider whose every method succeeds; `listen` keeps the dispatch it got. */
export function createFakeProvider(overrides?: Partial<BackProvider>): BackProvider & {
  readonly dispatchers: Array<() => boolean>;
} {
  const dispatchers: Array<() => boolean> = [];
  return {
    dispatchers,
    listen: vi.fn(async (dispatch: () => boolean) => {
      dispatchers.push(dispatch);
      return ok(undefined, "tauri");
    }),
    unlisten: vi.fn(async () => ok(undefined, "tauri")),
    exit: vi.fn(async () => ok(undefined, "tauri")),
    dispose: vi.fn(async () => undefined),
    ...overrides
  };
}
