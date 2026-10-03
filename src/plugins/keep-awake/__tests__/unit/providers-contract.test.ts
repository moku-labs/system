import { afterEach, describe, expect, it, vi } from "vitest";

import type { RuntimeKind, SystemResult } from "../../../runtime/result";
import type { KeepAwakeProvider } from "../../providers/types";
import { KEEP_AWAKE_METHODS } from "../../providers/types";
import { createWakeLockProvider } from "../../providers/wake-lock";
import { createMockLog, installWakeLock } from "./test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Runs the same wish sequence (on → off) against a provider and collects each result. */
async function runWishSequence(provider: KeepAwakeProvider): Promise<SystemResult<void>[]> {
  const on = await provider.set(true);
  const off = await provider.set(false);
  return [on, off];
}

/** Drops the `provider` field so results from two kinds compare structurally. */
const stripProvider = (result: SystemResult<void>): unknown =>
  result.ok
    ? { ok: true, value: result.value }
    : { ok: false, reason: result.reason, message: result.message };

describe.each<RuntimeKind>([
  "web",
  "tauri"
])("provider parity: createWakeLockProvider(%s)", kind => {
  describe("Screen Wake Lock present", () => {
    it("exposes every KEEP_AWAKE_METHODS entry plus dispose()", () => {
      installWakeLock();
      const provider = createWakeLockProvider(kind, createMockLog());

      for (const method of KEEP_AWAKE_METHODS) {
        expect(typeof provider[method]).toBe("function");
      }
      expect(typeof provider.dispose).toBe("function");
    });

    it("answers the same result shapes for the same wish sequence, tagged with its kind", async () => {
      installWakeLock();
      const provider = createWakeLockProvider(kind, createMockLog());

      const results = await runWishSequence(provider);

      for (const result of results) {
        expect(result.provider).toBe(kind);
      }
      expect(results.map(result => stripProvider(result))).toEqual([
        { ok: true, value: undefined },
        { ok: true, value: undefined }
      ]);
    });

    it("dispose() resolves without throwing", async () => {
      installWakeLock();
      const provider = createWakeLockProvider(kind, createMockLog());

      await expect(provider.dispose()).resolves.toBeUndefined();
    });
  });

  describe("Screen Wake Lock missing → unsupported stand-in", () => {
    it("exposes the same methods and answers 'unsupported' for every one", async () => {
      vi.stubGlobal("navigator", {});
      const provider = createWakeLockProvider(kind, createMockLog());

      for (const method of KEEP_AWAKE_METHODS) {
        expect(typeof provider[method]).toBe("function");
      }
      expect(await provider.set(true)).toEqual({
        ok: false,
        provider: kind,
        reason: "unsupported"
      });
      await expect(provider.dispose()).resolves.toBeUndefined();
    });
  });
});
