import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/app", () => ({
  onBackButtonPress: vi.fn(async () => ({ unregister: vi.fn(async () => undefined) })),
  exit: vi.fn(async () => undefined)
}));

import { unsupportedProvider } from "../../../runtime/result";
import { createTauriBackProvider } from "../../providers/tauri";
import type { BackProvider } from "../../providers/types";
import { BACK_METHODS } from "../../providers/types";
import { createWebBackProvider } from "../../providers/web";
import { createMockLog } from "./test-helpers";

/** Every provider exposes the BACK_METHODS plus dispose. */
function expectBackShape(provider: BackProvider): void {
  for (const method of BACK_METHODS) {
    expect(typeof provider[method]).toBe("function");
  }
  expect(typeof provider.dispose).toBe("function");
}

describe("provider parity: BackProvider contract", () => {
  it("createWebBackProvider satisfies BackProvider", () => {
    expectBackShape(createWebBackProvider());
  });

  it("createTauriBackProvider satisfies BackProvider", async () => {
    expectBackShape(await createTauriBackProvider(createMockLog()));
  });

  it("the non-Android tauri stand-in satisfies BackProvider", () => {
    const provider: BackProvider = unsupportedProvider("tauri", BACK_METHODS);

    expectBackShape(provider);
  });

  it("the web provider is uniformly 'unsupported' across every BACK_METHODS entry", async () => {
    const provider = createWebBackProvider();

    expect(await provider.listen(() => true)).toEqual({
      ok: false,
      provider: "web",
      reason: "unsupported"
    });
    expect(await provider.unlisten()).toEqual({
      ok: false,
      provider: "web",
      reason: "unsupported"
    });
    expect(await provider.exit()).toEqual({ ok: false, provider: "web", reason: "unsupported" });
  });

  it("every dispose() resolves", async () => {
    const tauriProvider = await createTauriBackProvider(createMockLog());

    await expect(createWebBackProvider().dispose()).resolves.toBeUndefined();
    await expect(tauriProvider.dispose()).resolves.toBeUndefined();
  });
});
