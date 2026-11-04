import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

// force-testing rule (runtime README): forcing kind "tauri" MUST be paired with vi.mock of
// the real Tauri modules so provider construction never reaches a real IPC call.
const { mockListen, listenImpl, nativeHandlers, nativeUnlisteners } = vi.hoisted(() => {
  const nativeHandlers = new Map<string, () => void>();
  const nativeUnlisteners = new Map<string, ReturnType<typeof vi.fn>>();
  const listenImpl = async (event: string, handler: () => void): Promise<() => void> => {
    nativeHandlers.set(event, handler);
    const unlisten = vi.fn();
    nativeUnlisteners.set(event, unlisten);
    return unlisten;
  };
  return { mockListen: vi.fn(listenImpl), listenImpl, nativeHandlers, nativeUnlisteners };
});

vi.mock("@tauri-apps/api/event", () => ({ listen: mockListen }));

import { coreConfig } from "../../../../config";
import type { RuntimeConfig } from "../../../runtime/types";
import { lifecyclePlugin } from "../../index";
import type { Unsubscribe } from "../../types";
import { createFakeDocument } from "../unit/test-helpers";

const SUSPENDED = "tauri://suspended";
const RESUMED = "tauri://resumed";
const FOCUS = "tauri://focus";

/**
 * Framework-internal integration bootstrap (house style: framework `__tests__` may reuse
 * `coreConfig` directly). Registers `lifecyclePlugin` as the sole regular plugin and forces
 * `ctx.runtime` through the createCore-level `pluginConfigs` (see runtime/README.md).
 */
function buildLifecycleApp(runtime: Partial<RuntimeConfig>) {
  const framework = coreConfig.createCore(coreConfig, {
    plugins: [lifecyclePlugin],
    pluginConfigs: { runtime }
  });
  return framework.createApp();
}

/** Start an iOS Tauri app over the fake bridge, with counting subscribers. */
async function startIos() {
  const doc = createFakeDocument();
  vi.stubGlobal("document", doc);
  const app = buildLifecycleApp({ forceKind: "tauri", forcePlatform: "ios" });
  const paused = vi.fn();
  const resumed = vi.fn();
  app.lifecycle.onPause(paused);
  app.lifecycle.onResume(resumed);
  await app.start();
  await vi.waitFor(() => expect(mockListen).toHaveBeenCalledTimes(3));
  return { app, doc, paused, resumed };
}

beforeEach(() => {
  nativeHandlers.clear();
  nativeUnlisteners.clear();
  mockListen.mockReset().mockImplementation(listenImpl);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("complex tier: lifecycle plugin (integration)", () => {
  describe("forceKind 'web' — visibilitychange", () => {
    it("onPause before start → start → hide → pause fired → stop → hide again → nothing fired", async () => {
      const doc = createFakeDocument();
      vi.stubGlobal("document", doc);
      const app = buildLifecycleApp({ forceKind: "web" });
      const paused = vi.fn();

      app.lifecycle.onPause(paused);
      await app.start();
      doc.setVisibility("hidden");
      expect(paused).toHaveBeenCalledTimes(1);

      await app.stop();
      doc.setVisibility("visible");
      doc.setVisibility("hidden");

      expect(paused).toHaveBeenCalledTimes(1);
      expect(doc.listenerCount()).toBe(0);
    });

    it("hidden → visible runs onResume once; a removed subscriber hears nothing more", async () => {
      const doc = createFakeDocument();
      vi.stubGlobal("document", doc);
      const app = buildLifecycleApp({ forceKind: "web" });
      const paused = vi.fn();
      const resumed = vi.fn();
      const offPause = app.lifecycle.onPause(paused);
      app.lifecycle.onResume(resumed);
      await app.start();

      doc.setVisibility("hidden");
      doc.setVisibility("visible");
      offPause();
      doc.setVisibility("hidden");

      expect(paused).toHaveBeenCalledTimes(1);
      expect(resumed).toHaveBeenCalledTimes(1);

      await app.stop();
    });

    it("a page already hidden at start reports one pause", async () => {
      vi.stubGlobal("document", createFakeDocument("hidden"));
      const app = buildLifecycleApp({ forceKind: "web" });
      const paused = vi.fn();
      app.lifecycle.onPause(paused);

      await app.start();

      expect(paused).toHaveBeenCalledTimes(1);

      await app.stop();
    });

    it("SSR (no document): start and stop succeed and nothing fires", async () => {
      const app = buildLifecycleApp({ forceKind: "web" });
      const paused = vi.fn();
      app.lifecycle.onPause(paused);

      await app.start();
      await app.stop();

      expect(paused).not.toHaveBeenCalled();
    });
  });

  describe("forceKind 'tauri' — native events plus visibilitychange", () => {
    it("iOS (P15): suspended then hidden → one pause; resumed then visible → one resume; stop unlistens", async () => {
      const doc = createFakeDocument();
      vi.stubGlobal("document", doc);
      const app = buildLifecycleApp({ forceKind: "tauri", forcePlatform: "ios" });
      const paused = vi.fn();
      const resumed = vi.fn();
      app.lifecycle.onPause(paused);
      app.lifecycle.onResume(resumed);
      await app.start();
      // Resolution is fire-and-forget from onStart; wait until all three native listeners exist.
      await vi.waitFor(() => expect(mockListen).toHaveBeenCalledTimes(3));

      nativeHandlers.get(SUSPENDED)?.();
      doc.setVisibility("hidden");
      nativeHandlers.get(RESUMED)?.();
      doc.setVisibility("visible");

      expect(paused).toHaveBeenCalledTimes(1);
      expect(resumed).toHaveBeenCalledTimes(1);

      await app.stop();

      expect(nativeUnlisteners.get(SUSPENDED)).toHaveBeenCalledTimes(1);
      expect(nativeUnlisteners.get(RESUMED)).toHaveBeenCalledTimes(1);
      expect(doc.listenerCount()).toBe(0);
    });

    it("desktop Tauri (no native suspend): visibilitychange alone drives pause and resume", async () => {
      const doc = createFakeDocument();
      vi.stubGlobal("document", doc);
      const app = buildLifecycleApp({ forceKind: "tauri", forcePlatform: "macos" });
      const paused = vi.fn();
      const resumed = vi.fn();
      app.lifecycle.onPause(paused);
      app.lifecycle.onResume(resumed);
      await app.start();
      await vi.waitFor(() => expect(mockListen).toHaveBeenCalledTimes(3));

      doc.setVisibility("hidden");
      doc.setVisibility("visible");

      expect(paused).toHaveBeenCalledTimes(1);
      expect(resumed).toHaveBeenCalledTimes(1);

      await app.stop();
    });

    it("a missing native event channel only warns: visibility still pauses the app", async () => {
      mockListen.mockRejectedValue(new Error("event.listen not allowed"));
      const doc = createFakeDocument();
      vi.stubGlobal("document", doc);
      const app = buildLifecycleApp({ forceKind: "tauri", forcePlatform: "android" });
      const paused = vi.fn();
      app.lifecycle.onPause(paused);
      await app.start();
      await vi.waitFor(() => expect(mockListen).toHaveBeenCalledTimes(3));

      doc.setVisibility("hidden");

      expect(paused).toHaveBeenCalledTimes(1);

      await app.stop();
      expect(doc.listenerCount()).toBe(0);
    });
  });

  describe("forceKind 'tauri' on iOS — interruptions that keep the page visible (F145)", () => {
    it("a screenshot (blur, suspended, then focus alone, page visible) resumes once", async () => {
      const { app, paused, resumed } = await startIos();

      nativeHandlers.get(SUSPENDED)?.();
      expect(paused).toHaveBeenCalledTimes(1);
      nativeHandlers.get(FOCUS)?.();

      expect(resumed).toHaveBeenCalledTimes(1);
      await app.stop();
      expect(nativeUnlisteners.get(FOCUS)).toHaveBeenCalledTimes(1);
    });

    it("Control Center, opened twice: each trip pauses once and resumes once", async () => {
      const { app, paused, resumed } = await startIos();

      for (let trip = 0; trip < 2; trip += 1) {
        nativeHandlers.get(SUSPENDED)?.();
        nativeHandlers.get(FOCUS)?.();
        nativeHandlers.get(FOCUS)?.();
      }

      expect(paused).toHaveBeenCalledTimes(2);
      expect(resumed).toHaveBeenCalledTimes(2);
      await app.stop();
    });

    it("resumes once, when the page shows, after a trip to the background", async () => {
      const { app, doc, paused, resumed } = await startIos();

      // Measured on the simulator: suspended, hidden, resumed while hidden, visible, focus.
      nativeHandlers.get(SUSPENDED)?.();
      doc.setVisibility("hidden");
      nativeHandlers.get(RESUMED)?.();
      expect(resumed).not.toHaveBeenCalled();
      doc.setVisibility("visible");
      expect(resumed).toHaveBeenCalledTimes(1);
      nativeHandlers.get(FOCUS)?.();

      expect(paused).toHaveBeenCalledTimes(1);
      expect(resumed).toHaveBeenCalledTimes(1);
      await app.stop();
    });

    it("a focus while the page is hidden resumes nothing", async () => {
      const { app, doc, resumed } = await startIos();

      nativeHandlers.get(SUSPENDED)?.();
      doc.setVisibility("hidden");
      nativeHandlers.get(FOCUS)?.();

      expect(resumed).not.toHaveBeenCalled();
      await app.stop();
    });
  });

  describe("types: API signatures", () => {
    it("onPause / onResume take a () => void callback and return Unsubscribe", () => {
      const app = buildLifecycleApp({ forceKind: "web" });

      expectTypeOf(app.lifecycle.onPause).parameter(0).toEqualTypeOf<() => void>();
      expectTypeOf(app.lifecycle.onPause).returns.toEqualTypeOf<Unsubscribe>();
      expectTypeOf(app.lifecycle.onResume).toEqualTypeOf<(fn: () => void) => Unsubscribe>();
    });

    it("rejects a non-function subscriber at compile time", () => {
      const app = buildLifecycleApp({ forceKind: "web" });

      // @ts-expect-error -- onPause takes a callback, not a string
      const offPause = app.lifecycle.onPause("pause");
      offPause();

      expect(app.lifecycle).toBeDefined();
    });
  });
});
