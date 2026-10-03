import type { ExpectChain, LogApi, LogEntry } from "@moku-labs/common";
import { vi } from "vitest";

import { ok } from "../../../runtime/result";
import type { HapticsProvider } from "../../providers/types";
import type { HapticsContext } from "../../types";

/**
 * Minimal LogApi test double. `error` and `warn` are spies; the remaining members are
 * typed stubs so the mock satisfies LogApi without casts (R7/R9).
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

/** Haptics domain context with a web runtime and an empty resolution slot by default. */
export function createMockCtx(overrides?: Partial<HapticsContext>): HapticsContext {
  return {
    config: {},
    // eslint-disable-next-line unicorn/no-null -- HapticsState.provider is typed `Promise<...> | null` (seam contract)
    state: overrides?.state ?? { provider: null },
    emit: overrides?.emit ?? vi.fn(),
    global: {},
    runtime: overrides?.runtime ?? { kind: "web", platform: "unknown" },
    log: overrides?.log ?? createMockLog()
  };
}

/** A provider whose every method succeeds on the web; override single methods per test. */
export function createFakeProvider(overrides?: Partial<HapticsProvider>): HapticsProvider {
  return {
    impact: vi.fn(async () => ok(undefined, "web")),
    notify: vi.fn(async () => ok(undefined, "web")),
    selection: vi.fn(async () => ok(undefined, "web")),
    dispose: vi.fn(async () => undefined),
    ...overrides
  };
}

/** What every `@tauri-apps/plugin-haptics` binding resolves with on success (2.4.1 `Result`). */
// eslint-disable-next-line unicorn/no-null -- the plugin's real Result shape carries `data: null`
export const OK_STATUS = { status: "ok", data: null } as const;

/** A vibration pattern as the web provider hands it to `navigator.vibrate`. */
export type VibratePattern = number | readonly number[];

/** A `navigator.vibrate` spy that accepts every pattern. */
export function createVibrate(accepted = true) {
  return vi.fn((_pattern: VibratePattern): boolean => accepted);
}
