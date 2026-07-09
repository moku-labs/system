import type { ExpectChain, LogApi, LogEntry } from "@moku-labs/common";
import { vi } from "vitest";

/**
 * Minimal LogApi test double. `debug` and `error` are exercised by the deliver/api
 * pipeline tests; the remaining members are typed stubs so the mock structurally
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
