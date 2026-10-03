import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** What the native side hands a Back listener. */
type BackPayload = { canGoBack: boolean };

const { appModule, mockOnBackButtonPress, mockUnregister, mockExit, getHandler, resetHandler } =
  vi.hoisted(() => {
    let handler: ((payload: BackPayload) => unknown) | undefined;
    const mockUnregister = vi.fn(async () => undefined);
    const mockOnBackButtonPress = vi.fn(async (h: (payload: BackPayload) => unknown) => {
      handler = h;
      return { unregister: mockUnregister };
    });
    const mockExit = vi.fn(async (_code?: number) => undefined);
    // A mutable module object: a test drops `exit` to replay an older @tauri-apps/api.
    const appModule: {
      onBackButtonPress: typeof mockOnBackButtonPress;
      exit: typeof mockExit | undefined;
    } = { onBackButtonPress: mockOnBackButtonPress, exit: mockExit };
    return {
      appModule,
      mockOnBackButtonPress,
      mockUnregister,
      mockExit,
      getHandler: () => handler,
      resetHandler: (): void => {
        handler = undefined;
      }
    };
  });

vi.mock("@tauri-apps/api/app", () => appModule);

import { createTauriBackProvider } from "../../providers/tauri";
import { createMockLog } from "./test-helpers";

/** Simulate one hardware Back press and wait for its default action to finish. */
async function press(payload: BackPayload): Promise<void> {
  const handler = getHandler();
  if (handler === undefined) {
    throw new Error("no native Back listener is registered");
  }
  await handler(payload);
}

const mockHistoryBack = vi.fn();

beforeEach(() => {
  appModule.exit = mockExit;
  mockExit.mockReset();
  mockExit.mockResolvedValue(undefined);
  mockOnBackButtonPress.mockClear();
  mockUnregister.mockReset();
  mockUnregister.mockResolvedValue(undefined);
  mockHistoryBack.mockClear();
  resetHandler();
  vi.stubGlobal("history", { back: mockHistoryBack });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createTauriBackProvider", () => {
  describe("listen + the native press handler", () => {
    it("registers onBackButtonPress once and answers ok", async () => {
      const provider = await createTauriBackProvider(createMockLog());

      const result = await provider.listen(() => true);

      expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
      expect(mockOnBackButtonPress).toHaveBeenCalledTimes(1);
    });

    it("does not stack a second native listener while one is held", async () => {
      const provider = await createTauriBackProvider(createMockLog());

      await provider.listen(() => true);
      const result = await provider.listen(() => true);

      expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
      expect(mockOnBackButtonPress).toHaveBeenCalledTimes(1);
    });

    it("a press taken by dispatch runs no default", async () => {
      const provider = await createTauriBackProvider(createMockLog());
      const dispatch = vi.fn(() => true);
      await provider.listen(dispatch);

      await press({ canGoBack: true });

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(mockHistoryBack).not.toHaveBeenCalled();
      expect(mockExit).not.toHaveBeenCalled();
    });

    it("an untaken press with history goes back in the webview", async () => {
      const provider = await createTauriBackProvider(createMockLog());
      await provider.listen(() => false);

      await press({ canGoBack: true });

      expect(mockHistoryBack).toHaveBeenCalledTimes(1);
      expect(mockExit).not.toHaveBeenCalled();
    });

    it("an untaken press with no history closes the app with exit(0)", async () => {
      const provider = await createTauriBackProvider(createMockLog());
      await provider.listen(() => false);

      await press({ canGoBack: false });

      expect(mockExit).toHaveBeenCalledWith(0);
      expect(mockHistoryBack).not.toHaveBeenCalled();
    });

    it("an untaken press with history and no history global does not throw", async () => {
      vi.unstubAllGlobals();
      const provider = await createTauriBackProvider(createMockLog());
      await provider.listen(() => false);

      await expect(press({ canGoBack: true })).resolves.toBeUndefined();
      expect(mockExit).not.toHaveBeenCalled();
    });

    it("logs a warning when the default exit fails", async () => {
      mockExit.mockRejectedValue(new Error("not allowed: core:app:allow-exit"));
      const log = createMockLog();
      const provider = await createTauriBackProvider(log);
      await provider.listen(() => false);

      await press({ canGoBack: false });

      expect(log.warn).toHaveBeenCalledWith("back:default-exit-failed", {
        reason: "error",
        message: "not allowed: core:app:allow-exit"
      });
    });

    it("a rejected registration is logged and maps to 'error', never 'denied'", async () => {
      mockOnBackButtonPress.mockRejectedValueOnce(
        new Error("plugin:app|register_listener refused")
      );
      const log = createMockLog();
      const provider = await createTauriBackProvider(log);

      const result = await provider.listen(() => true);

      expect(result).toEqual({
        ok: false,
        provider: "tauri",
        reason: "error",
        message: "plugin:app|register_listener refused"
      });
      expect(log.error).toHaveBeenCalledWith(
        "back:tauri-listen-failed",
        undefined,
        new Error("plugin:app|register_listener refused")
      );
    });

    it("wraps a non-Error registration rejection into an Error for the log", async () => {
      mockOnBackButtonPress.mockRejectedValueOnce("plain string");
      const log = createMockLog();
      const provider = await createTauriBackProvider(log);

      await provider.listen(() => true);

      const logged = vi.mocked(log.error).mock.calls[0]?.[2];
      expect(logged).toBeInstanceOf(Error);
      expect(logged?.message).toBe("plain string");
    });
  });

  describe("unlisten", () => {
    it("unregisters the native listener and answers ok", async () => {
      const provider = await createTauriBackProvider(createMockLog());
      await provider.listen(() => true);

      const result = await provider.unlisten();

      expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
      expect(mockUnregister).toHaveBeenCalledTimes(1);
    });

    it("answers ok without unregistering when no listener is held", async () => {
      const provider = await createTauriBackProvider(createMockLog());

      await provider.listen(() => true);
      await provider.unlisten();
      const result = await provider.unlisten();

      expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
      expect(mockUnregister).toHaveBeenCalledTimes(1);
    });

    it("a failed unregister is logged and maps to 'error'", async () => {
      mockUnregister.mockRejectedValueOnce(new Error("listener already gone"));
      const log = createMockLog();
      const provider = await createTauriBackProvider(log);
      await provider.listen(() => true);

      const result = await provider.unlisten();

      expect(result).toEqual({
        ok: false,
        provider: "tauri",
        reason: "error",
        message: "listener already gone"
      });
      expect(log.error).toHaveBeenCalledWith(
        "back:tauri-unlisten-failed",
        undefined,
        new Error("listener already gone")
      );
    });

    it("listens again after an unlisten", async () => {
      const provider = await createTauriBackProvider(createMockLog());

      await provider.listen(() => true);
      await provider.unlisten();
      await provider.listen(() => true);

      expect(mockOnBackButtonPress).toHaveBeenCalledTimes(2);
    });
  });

  describe("exit", () => {
    it("calls exit(0) and answers ok", async () => {
      const provider = await createTauriBackProvider(createMockLog());

      const result = await provider.exit();

      expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it("answers 'unavailable' when @tauri-apps/api has no exit (older than 2.12)", async () => {
      appModule.exit = undefined;
      const provider = await createTauriBackProvider(createMockLog());

      const result = await provider.exit();

      expect(result).toEqual({
        ok: false,
        provider: "tauri",
        reason: "unavailable",
        message: "exit() needs @tauri-apps/api 2.12 or newer"
      });
    });

    it("a refused exit maps to 'error' with the raw message, never 'denied'", async () => {
      mockExit.mockRejectedValueOnce(
        new Error("app.exit not allowed. Permissions associated: core:app:allow-exit")
      );
      const provider = await createTauriBackProvider(createMockLog());

      const result = await provider.exit();

      expect(result).toEqual({
        ok: false,
        provider: "tauri",
        reason: "error",
        message: "app.exit not allowed. Permissions associated: core:app:allow-exit"
      });
    });
  });

  describe("dispose", () => {
    it("unregisters the listener; later listen and exit answer 'app stopped'", async () => {
      const provider = await createTauriBackProvider(createMockLog());
      await provider.listen(() => true);

      await provider.dispose();

      expect(mockUnregister).toHaveBeenCalledTimes(1);
      const stopped = {
        ok: false,
        provider: "tauri",
        reason: "unavailable",
        message: "app stopped"
      };
      expect(await provider.listen(() => true)).toEqual(stopped);
      expect(await provider.exit()).toEqual(stopped);
      expect(mockOnBackButtonPress).toHaveBeenCalledTimes(1);
      expect(mockExit).not.toHaveBeenCalled();
    });

    it("a later unlisten answers ok without a second unregister", async () => {
      const provider = await createTauriBackProvider(createMockLog());
      await provider.listen(() => true);
      await provider.dispose();

      const result = await provider.unlisten();

      expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
      expect(mockUnregister).toHaveBeenCalledTimes(1);
    });

    it("is idempotent", async () => {
      const provider = await createTauriBackProvider(createMockLog());
      await provider.listen(() => true);

      await provider.dispose();
      await provider.dispose();

      expect(mockUnregister).toHaveBeenCalledTimes(1);
    });

    it("unregisters nothing when no listener was held", async () => {
      const provider = await createTauriBackProvider(createMockLog());

      await provider.dispose();

      expect(mockUnregister).not.toHaveBeenCalled();
    });

    it("never rejects, even when the unregister fails", async () => {
      mockUnregister.mockRejectedValueOnce(new Error("listener already gone"));
      const log = createMockLog();
      const provider = await createTauriBackProvider(log);
      await provider.listen(() => true);

      await expect(provider.dispose()).resolves.toBeUndefined();
      expect(log.error).toHaveBeenCalledWith(
        "back:tauri-unlisten-failed",
        undefined,
        new Error("listener already gone")
      );
    });

    it("a registration still in flight at dispose unregisters itself when it lands", async () => {
      let land: (() => void) | undefined;
      mockOnBackButtonPress.mockImplementationOnce(
        async () =>
          new Promise<{ unregister: typeof mockUnregister }>(resolve => {
            land = () => resolve({ unregister: mockUnregister });
          })
      );
      const provider = await createTauriBackProvider(createMockLog());

      const pending = provider.listen(() => true);
      await provider.dispose();
      land?.();
      const result = await pending;

      expect(result).toEqual({
        ok: false,
        provider: "tauri",
        reason: "unavailable",
        message: "app stopped"
      });
      expect(mockUnregister).toHaveBeenCalledTimes(1);
    });
  });
});
