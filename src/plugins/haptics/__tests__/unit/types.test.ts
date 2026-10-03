import { describe, expect, expectTypeOf, it } from "vitest";

import type { SystemResult } from "../../../runtime/result";
import { createHapticsApi } from "../../api";
import type { HapticsApi, ImpactKind, NotifyKind } from "../../types";
import { createMockCtx } from "./test-helpers";

describe("haptics types", () => {
  it("ImpactKind is exactly light | medium | heavy", () => {
    expectTypeOf<ImpactKind>().toEqualTypeOf<"light" | "medium" | "heavy">();
  });

  it("NotifyKind is exactly success | warning | error", () => {
    expectTypeOf<NotifyKind>().toEqualTypeOf<"success" | "warning" | "error">();
  });

  it("every HapticsApi method takes its kind and resolves SystemResult<void>", () => {
    expectTypeOf<HapticsApi["impact"]>().parameters.toEqualTypeOf<[ImpactKind]>();
    expectTypeOf<HapticsApi["notify"]>().parameters.toEqualTypeOf<[NotifyKind]>();
    expectTypeOf<HapticsApi["selection"]>().parameters.toEqualTypeOf<[]>();
    expectTypeOf<HapticsApi["impact"]>().returns.resolves.toEqualTypeOf<SystemResult<void>>();
    expectTypeOf<HapticsApi["notify"]>().returns.resolves.toEqualTypeOf<SystemResult<void>>();
    expectTypeOf<HapticsApi["selection"]>().returns.resolves.toEqualTypeOf<SystemResult<void>>();
  });

  it("rejects the Tauri-only impact style 'soft' at compile time", async () => {
    const api = createHapticsApi(createMockCtx());

    // @ts-expect-error -- "soft" is a Tauri style this API does not expose
    const result = await api.impact("soft");

    expect(result.ok).toBe(false);
  });

  it("rejects a notify kind outside success / warning / error at compile time", async () => {
    const api = createHapticsApi(createMockCtx());

    // @ts-expect-error -- "info" is not a NotifyKind
    const result = await api.notify("info");

    expect(result.ok).toBe(false);
  });
});
