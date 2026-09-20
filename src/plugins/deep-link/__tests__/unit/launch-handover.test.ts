import { describe, expect, it, vi } from "vitest";

import { ok } from "../../../runtime/result";
import { createDeepLinkApi, createDeliver } from "../../api";
import type { DeepLinkProvider } from "../../providers/types";
import type { DeepLinkContext, DeepLinkState } from "../../types";
import { createMockLog } from "./test-helpers";

/** A hand-cranked clock — the launch phase is time-bounded, never timer-driven. */
const createClock = (): { now: () => number; advance: (ms: number) => void } => {
  let value = 1000;
  return {
    now: () => value,
    advance: (ms: number) => {
      value += ms;
    }
  };
};

const createState = (): DeepLinkState => ({
  // eslint-disable-next-line unicorn/no-null -- DeepLinkState.provider is typed `Promise<...> | null` (seam contract)
  provider: null,
  handedOver: new Map(),
  launchPhaseOpen: true,
  // eslint-disable-next-line unicorn/no-null -- the window opens at the first launch-phase touch
  launchPhaseEndsAt: null,
  subscribers: new Set()
});

const createCtx = (state: DeepLinkState, schemes: string[] = []): DeepLinkContext => ({
  config: { schemes },
  state,
  emit: vi.fn(),
  global: {},
  runtime: { kind: "tauri", platform: "macos" },
  log: createMockLog()
});

/**
 * A provider whose getCurrent() reports the launch list the way the Tauri one does:
 * it returns the first URL and pushes every extra down the delivery channel first.
 */
const createLaunchProvider = (urls: string[], onUrl?: (url: string) => void): DeepLinkProvider => ({
  getCurrent: vi.fn(async () => {
    for (const extra of urls.slice(1)) {
      onUrl?.(extra);
    }
    // eslint-disable-next-line unicorn/no-null -- SystemOk<string | null> — no launch URL
    return ok(urls[0] ?? null, "tauri");
  }),
  dispose: vi.fn(async () => undefined)
});

describe("launch-URL handover — each launch URL reaches the app exactly once", () => {
  it("event before getCurrent: the delivery wins and getCurrent then reports ok(null)", async () => {
    const clock = createClock();
    const state = createState();
    const ctx = createCtx(state);
    const deliver = createDeliver(ctx, clock.now);
    const subscriber = vi.fn();
    state.subscribers.add(subscriber);
    state.provider = Promise.resolve({ ok: true, provider: createLaunchProvider(["myapp://a"]) });
    const api = createDeepLinkApi(ctx, clock.now);

    deliver("myapp://a");
    const current = await api.getCurrent();

    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(ctx.emit).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line unicorn/no-null -- already handed over through onOpen
    expect(current).toEqual({ ok: true, value: null, provider: "tauri" });
  });

  it("getCurrent before event: getCurrent wins and the replay is dropped exactly once", async () => {
    const clock = createClock();
    const state = createState();
    const ctx = createCtx(state);
    const deliver = createDeliver(ctx, clock.now);
    state.provider = Promise.resolve({ ok: true, provider: createLaunchProvider(["myapp://a"]) });
    const api = createDeepLinkApi(ctx, clock.now);

    const current = await api.getCurrent();
    deliver("myapp://a");

    expect(current).toEqual({ ok: true, value: "myapp://a", provider: "tauri" });
    expect(ctx.emit).not.toHaveBeenCalled();
    expect(ctx.log.debug).toHaveBeenCalledWith("deepLink:launch-replay-dropped", {
      url: "myapp://a"
    });

    deliver("myapp://a");
    expect(ctx.emit).toHaveBeenCalledTimes(1);
  });

  it("extra launch URLs are forwarded, and the replay of the first one is still dropped once", async () => {
    const clock = createClock();
    const state = createState();
    const ctx = createCtx(state);
    const deliver = createDeliver(ctx, clock.now);
    state.provider = Promise.resolve({
      ok: true,
      provider: createLaunchProvider(["myapp://a", "myapp://b", "myapp://c"], deliver)
    });
    const api = createDeepLinkApi(ctx, clock.now);

    const current = await api.getCurrent();

    expect(current).toEqual({ ok: true, value: "myapp://a", provider: "tauri" });
    expect(ctx.emit).toHaveBeenCalledTimes(2);
    expect(ctx.emit).toHaveBeenNthCalledWith(1, "deepLink:open", { url: "myapp://b" });
    expect(ctx.emit).toHaveBeenNthCalledWith(2, "deepLink:open", { url: "myapp://c" });

    deliver("myapp://a");

    expect(ctx.emit).toHaveBeenCalledTimes(2);
  });

  it("re-clicking the launch URL once the launch phase is over is delivered", async () => {
    const clock = createClock();
    const state = createState();
    const ctx = createCtx(state);
    const deliver = createDeliver(ctx, clock.now);
    state.provider = Promise.resolve({ ok: true, provider: createLaunchProvider(["myapp://a"]) });
    const api = createDeepLinkApi(ctx, clock.now);

    await api.getCurrent();
    clock.advance(5001);

    deliver("myapp://a");
    deliver("myapp://a");

    expect(ctx.emit).toHaveBeenCalledTimes(2);
    expect(state.handedOver.size).toBe(0);
  });

  it("a second delivery of an already-delivered URL ends the launch phase and clears the record", () => {
    const clock = createClock();
    const state = createState();
    const ctx = createCtx(state);
    const deliver = createDeliver(ctx, clock.now);

    deliver("myapp://a");
    deliver("myapp://a");

    expect(ctx.emit).toHaveBeenCalledTimes(2);
    expect(state.launchPhaseOpen).toBe(false);
    expect(state.handedOver.size).toBe(0);
  });

  it("two getCurrent() calls report the same launch URL both times", async () => {
    const clock = createClock();
    const state = createState();
    const ctx = createCtx(state);
    state.provider = Promise.resolve({ ok: true, provider: createLaunchProvider(["myapp://a"]) });
    const api = createDeepLinkApi(ctx, clock.now);

    const first = await api.getCurrent();
    const second = await api.getCurrent();

    expect(first).toEqual({ ok: true, value: "myapp://a", provider: "tauri" });
    expect(second).toEqual(first);
  });

  it("two getCurrent() calls both report ok(null) once the URL arrived through onOpen", async () => {
    const clock = createClock();
    const state = createState();
    const ctx = createCtx(state);
    const deliver = createDeliver(ctx, clock.now);
    state.provider = Promise.resolve({ ok: true, provider: createLaunchProvider(["myapp://a"]) });
    const api = createDeepLinkApi(ctx, clock.now);

    deliver("myapp://a");
    const first = await api.getCurrent();
    const second = await api.getCurrent();

    // eslint-disable-next-line unicorn/no-null -- already handed over through onOpen
    expect(first).toEqual({ ok: true, value: null, provider: "tauri" });
    expect(second).toEqual(first);
  });

  it("getCurrent() reports the launch URL unchanged once the launch phase is over", async () => {
    const clock = createClock();
    const state = createState();
    const ctx = createCtx(state);
    const deliver = createDeliver(ctx, clock.now);
    state.provider = Promise.resolve({ ok: true, provider: createLaunchProvider(["myapp://a"]) });
    const api = createDeepLinkApi(ctx, clock.now);

    deliver("myapp://a");
    clock.advance(5001);
    const current = await api.getCurrent();

    expect(current).toEqual({ ok: true, value: "myapp://a", provider: "tauri" });
  });

  it("a scheme-filtered delivery never touches the handover record", () => {
    const clock = createClock();
    const state = createState();
    const ctx = createCtx(state, ["myapp"]);
    const deliver = createDeliver(ctx, clock.now);

    deliver("other://open");

    expect(state.handedOver.size).toBe(0);
    expect(state.launchPhaseOpen).toBe(true);
  });
});
