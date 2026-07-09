import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

// force-testing rule (runtime README): forcing kind "tauri" MUST be paired with
// vi.mock of the real Tauri modules so provider construction never reaches a real
// IPC call, even though this suite only forces kind "web" below.
const { mockReadText, mockWriteText } = vi.hoisted(() => ({
  mockReadText: vi.fn(),
  mockWriteText: vi.fn()
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: mockReadText,
  writeText: mockWriteText
}));

import { coreConfig } from "../../../../config";
import type { SystemErrorReason, SystemResult } from "../../../../index";
import type { RuntimeConfig } from "../../../runtime/types";
import { clipboardPlugin } from "../../index";

/**
 * Framework-internal integration bootstrap (house style: framework `__tests__` may
 * import/reuse `coreConfig` directly). Reuses the real system coreConfig — already
 * carrying log/env/runtime as core plugins — and registers `clipboardPlugin` as the
 * sole regular plugin, forcing `ctx.runtime` via the loosely-typed `createCore`-level
 * `pluginConfigs` (core-plugin overrides are only reachable at the createCoreConfig/
 * createCore level, never from createApp — see runtime/README.md).
 */
function buildClipboardApp(overrides: { runtime?: Partial<RuntimeConfig> }) {
  const framework = coreConfig.createCore(coreConfig, {
    plugins: [clipboardPlugin],
    pluginConfigs: overrides
  });
  return framework.createApp();
}

beforeEach(() => {
  mockReadText.mockReset().mockResolvedValue("clipboard text");
  mockWriteText.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("complex tier: clipboard plugin (integration)", () => {
  describe("forceKind 'web' — full lifecycle over navigator.clipboard", () => {
    it("start → writeText/readText → stop", async () => {
      const readText = vi.fn(async () => "hello from clipboard");
      const writeText = vi.fn(async () => undefined);
      vi.stubGlobal("navigator", { clipboard: { readText, writeText } });

      const app = buildClipboardApp({ runtime: { forceKind: "web" } });
      await app.start();

      const writeResult = await app.clipboard.writeText("share this url");
      expect(writeResult).toEqual({ ok: true, value: undefined, provider: "web" });
      expect(writeText).toHaveBeenCalledWith("share this url");

      const readResult = await app.clipboard.readText();
      expect(readResult).toEqual({ ok: true, value: "hello from clipboard", provider: "web" });

      await app.stop();
      expect(mockWriteText).not.toHaveBeenCalled();
    });

    it("API calls before app.start() resolve to 'unavailable'", async () => {
      vi.stubGlobal("navigator", {});
      const app = buildClipboardApp({ runtime: { forceKind: "web" } });

      const result = await app.clipboard.readText();

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "unavailable",
        message: "app not started — call app.start() first"
      });
    });

    it("NotAllowedError surfaces as a typed 'denied' failure through the full lifecycle", async () => {
      const readText = vi.fn(async () => {
        throw new DOMException("Permission denied", "NotAllowedError");
      });
      const writeText = vi.fn(async () => undefined);
      vi.stubGlobal("navigator", { clipboard: { readText, writeText } });

      const app = buildClipboardApp({ runtime: { forceKind: "web" } });
      await app.start();

      const result = await app.clipboard.readText();

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "denied",
        message: "Permission denied"
      });

      await app.stop();
    });
  });

  describe("forceKind 'tauri' — real provider wired through the full lifecycle", () => {
    it("start → writeText/readText → stop", async () => {
      mockReadText.mockResolvedValue("native clipboard value");

      const app = buildClipboardApp({ runtime: { forceKind: "tauri" } });
      await app.start();

      const writeResult = await app.clipboard.writeText("native write");
      expect(writeResult).toEqual({ ok: true, value: undefined, provider: "tauri" });
      expect(mockWriteText).toHaveBeenCalledWith("native write");

      const readResult = await app.clipboard.readText();
      expect(readResult).toEqual({
        ok: true,
        value: "native clipboard value",
        provider: "tauri"
      });

      await app.stop();
    });
  });

  describe("types: API signatures", () => {
    it("readText resolves SystemResult<string>", async () => {
      vi.stubGlobal("navigator", {});
      const app = buildClipboardApp({ runtime: { forceKind: "web" } });
      await app.start();

      expectTypeOf(app.clipboard.readText).returns.resolves.toEqualTypeOf<SystemResult<string>>();

      await app.stop();
    });

    it("writeText accepts a string and resolves SystemResult<void>", async () => {
      vi.stubGlobal("navigator", {});
      const app = buildClipboardApp({ runtime: { forceKind: "web" } });
      await app.start();

      expectTypeOf(app.clipboard.writeText).toBeFunction();
      expectTypeOf(app.clipboard.writeText("hi")).resolves.toEqualTypeOf<SystemResult<void>>();

      await app.stop();
    });

    it("rejects a non-string argument to writeText at compile time", async () => {
      vi.stubGlobal("navigator", {});
      const app = buildClipboardApp({ runtime: { forceKind: "web" } });

      // @ts-expect-error -- writeText requires a string
      await app.clipboard.writeText(123);

      expect(app).toBeDefined();
    });

    it("narrows SystemResult via the ok discriminant", async () => {
      const readText = vi.fn(async () => "value");
      const writeText = vi.fn(async () => undefined);
      vi.stubGlobal("navigator", { clipboard: { readText, writeText } });
      const app = buildClipboardApp({ runtime: { forceKind: "web" } });
      await app.start();

      const result = await app.clipboard.readText();
      if (result.ok) {
        expectTypeOf(result.value).toEqualTypeOf<string>();
      } else {
        expectTypeOf(result.reason).toEqualTypeOf<SystemErrorReason>();
      }

      await app.stop();
    });
  });
});
