import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

/** What the native side hands a Back listener. */
type BackPayload = { canGoBack: boolean };

// force-testing rule (runtime README): forcing kind "tauri" MUST be paired with
// vi.mock of the real Tauri module so the provider never reaches a real IPC call.
const { mockOnBackButtonPress, mockUnregister, mockExit, getHandler, resetHandler } = vi.hoisted(
  () => {
    let handler: ((payload: BackPayload) => unknown) | undefined;
    const mockUnregister = vi.fn(async () => undefined);
    const mockOnBackButtonPress = vi.fn(async (h: (payload: BackPayload) => unknown) => {
      handler = h;
      return { unregister: mockUnregister };
    });
    const mockExit = vi.fn(async (_code?: number) => undefined);
    return {
      mockOnBackButtonPress,
      mockUnregister,
      mockExit,
      getHandler: () => handler,
      resetHandler: (): void => {
        handler = undefined;
      }
    };
  }
);

vi.mock("@tauri-apps/api/app", () => ({
  onBackButtonPress: mockOnBackButtonPress,
  exit: mockExit
}));

import type { SystemErrorReason, SystemResult } from "../../../../index";
import { createApp } from "../../../../index";
import { backPlugin } from "../../index";

// Hoisted, not inlined: `runtime` is a core plugin, so it is not one of the typed
// `pluginConfigs` keys of createApp. A hoisted object is not "fresh", so TypeScript
// accepts the key, and the kernel applies it (see tests/unit/exports.test.ts).
const ANDROID = { runtime: { forceKind: "tauri", forcePlatform: "android" } } as const;
const IOS = { runtime: { forceKind: "tauri", forcePlatform: "ios" } } as const;
const WEB = { runtime: { forceKind: "web", forcePlatform: "unknown" } } as const;

/**
 * Build a system app with only the back capability, on a forced runtime.
 *
 * @param pluginConfigs - The forced runtime.
 * @returns The app.
 */
function buildBackApp(pluginConfigs: typeof ANDROID | typeof IOS | typeof WEB) {
  return createApp({ plugins: [backPlugin], pluginConfigs });
}

/** Simulate one hardware Back press and wait for its default action to finish. */
async function press(payload: BackPayload): Promise<void> {
  const handler = getHandler();
  if (handler === undefined) {
    throw new Error("no native Back listener is registered");
  }
  await handler(payload);
}

/** Wait until the native Back listener has been registered `times` times. */
async function listenerRegistered(times = 1): Promise<void> {
  await vi.waitFor(() => {
    expect(mockOnBackButtonPress).toHaveBeenCalledTimes(times);
  });
}

const mockHistoryBack = vi.fn();

beforeEach(() => {
  mockOnBackButtonPress.mockClear();
  mockUnregister.mockClear();
  mockExit.mockClear();
  mockHistoryBack.mockClear();
  resetHandler();
  vi.stubGlobal("history", { back: mockHistoryBack });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("complex tier: back plugin (integration)", () => {
  describe("forceKind 'web' — no hardware Back", () => {
    it("onPress returns a remover and exit() answers 'unsupported'", async () => {
      const app = buildBackApp(WEB);
      await app.start();

      const off = app.back.onPress(() => true);
      const result = await app.back.exit();

      expect(typeof off).toBe("function");
      expect(result).toEqual({ ok: false, provider: "web", reason: "unsupported" });
      expect(mockOnBackButtonPress).not.toHaveBeenCalled();
      off();

      await app.stop();
    });
  });

  describe("forceKind 'tauri' + forcePlatform 'android' — the real provider", () => {
    it("a press reaches the handler, and a taken press runs no default", async () => {
      const app = buildBackApp(ANDROID);
      await app.start();
      const handler = vi.fn(() => true);

      app.back.onPress(handler);
      await listenerRegistered();
      await press({ canGoBack: true });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(mockHistoryBack).not.toHaveBeenCalled();
      expect(mockExit).not.toHaveBeenCalled();

      await app.stop();
    });

    it("handlers added before start get the listener after start", async () => {
      const app = buildBackApp(ANDROID);
      const handler = vi.fn(() => true);

      app.back.onPress(handler);
      await app.start();
      await listenerRegistered();
      await press({ canGoBack: false });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(mockExit).not.toHaveBeenCalled();

      await app.stop();
    });

    it("an untaken press replays the system default: back in history, else exit(0)", async () => {
      const app = buildBackApp(ANDROID);
      await app.start();

      app.back.onPress(() => false);
      await listenerRegistered();
      await press({ canGoBack: true });
      await press({ canGoBack: false });

      expect(mockHistoryBack).toHaveBeenCalledTimes(1);
      expect(mockExit).toHaveBeenCalledWith(0);

      await app.stop();
    });

    it("with no handler the system Back is never replaced", async () => {
      const app = buildBackApp(ANDROID);
      await app.start();

      // exit() awaits the same resolution the start-time reconcile step awaits.
      const result = await app.back.exit();

      expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
      expect(mockExit).toHaveBeenCalledWith(0);
      expect(mockOnBackButtonPress).not.toHaveBeenCalled();

      await app.stop();
    });

    it("the last remover gives Back back to the system", async () => {
      const app = buildBackApp(ANDROID);
      await app.start();

      const off = app.back.onPress(() => true);
      await listenerRegistered();
      off();

      await vi.waitFor(() => {
        expect(mockUnregister).toHaveBeenCalledTimes(1);
      });

      await app.stop();
      expect(mockUnregister).toHaveBeenCalledTimes(1);
    });

    it("app.stop() unregisters the native listener", async () => {
      const app = buildBackApp(ANDROID);
      await app.start();
      app.back.onPress(() => true);
      await listenerRegistered();

      await app.stop();

      expect(mockUnregister).toHaveBeenCalledTimes(1);
    });
  });

  describe("forceKind 'tauri' + forcePlatform 'ios' — Android only (D-S05)", () => {
    it("handlers are kept, no native listener, exit() answers 'unsupported'", async () => {
      const app = buildBackApp(IOS);
      await app.start();

      app.back.onPress(() => true);
      const result = await app.back.exit();

      expect(result).toEqual({ ok: false, provider: "tauri", reason: "unsupported" });
      expect(mockOnBackButtonPress).not.toHaveBeenCalled();
      expect(mockExit).not.toHaveBeenCalled();

      await app.stop();
    });
  });

  describe("runtime: lifecycle", () => {
    it("exit() before app.start() resolves to 'unavailable'", async () => {
      const app = buildBackApp(WEB);

      const result = await app.back.exit();

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "unavailable",
        message: "app not started — call app.start() first"
      });
    });
  });

  describe("types: API signatures", () => {
    it("onPress takes a () => boolean handler; exit resolves SystemResult<void>", () => {
      const app = buildBackApp(WEB);

      expectTypeOf(app.back.onPress).parameter(0).toEqualTypeOf<() => boolean>();
      expectTypeOf(app.back.onPress(() => true)).toEqualTypeOf<() => void>();
      expectTypeOf(app.back.exit()).resolves.toEqualTypeOf<SystemResult<void>>();
    });

    it("rejects a handler that does not return a boolean at compile time", () => {
      const app = buildBackApp(WEB);

      // @ts-expect-error -- a handler must say whether it took the press
      const off = app.back.onPress(() => "closed");

      expect(typeof off).toBe("function");
    });

    it("narrows SystemResult via the ok discriminant", async () => {
      const app = buildBackApp(WEB);
      await app.start();

      const result = await app.back.exit();
      if (result.ok) {
        expectTypeOf(result.value).toEqualTypeOf<void>();
      } else {
        expectTypeOf(result.reason).toEqualTypeOf<SystemErrorReason>();
      }

      await app.stop();
    });
  });
});
