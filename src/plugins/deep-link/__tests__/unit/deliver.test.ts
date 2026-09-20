import { describe, expect, it, vi } from "vitest";

import { createDeliver } from "../../api";
import type { DeepLinkContext, DeepLinkState } from "../../types";
import { createMockLog } from "./test-helpers";

const createMockCtx = (overrides?: Partial<DeepLinkContext>): DeepLinkContext => ({
  config: { schemes: [], ...overrides?.config },
  state:
    overrides?.state ??
    ({
      // eslint-disable-next-line unicorn/no-null -- DeepLinkState.provider is typed `Promise<...> | null` (seam contract)
      provider: null,
      // eslint-disable-next-line unicorn/no-null -- launchUrl is null until getCurrent() records one
      launchUrl: null,
      launchReplayDone: false,
      subscribers: new Set()
    } satisfies DeepLinkState),
  emit: overrides?.emit ?? vi.fn(),
  global: overrides?.global ?? {},
  runtime: overrides?.runtime ?? { kind: "web", platform: "unknown" },
  log: overrides?.log ?? createMockLog()
});

describe("createDeliver", () => {
  describe("scheme filter", () => {
    it("empty schemes: accepts every URL", () => {
      const ctx = createMockCtx({ config: { schemes: [] } });
      const deliver = createDeliver(ctx);

      deliver("anything://open");

      expect(ctx.emit).toHaveBeenCalledWith("deepLink:open", { url: "anything://open" });
    });

    it("non-empty schemes: drops a non-matching URL and logs at debug level", () => {
      const ctx = createMockCtx({ config: { schemes: ["myapp"] } });
      const deliver = createDeliver(ctx);

      deliver("other://open");

      expect(ctx.emit).not.toHaveBeenCalled();
      expect(ctx.log.debug).toHaveBeenCalledWith("deepLink:delivery-scheme-filtered", {
        url: "other://open"
      });
    });

    it("non-empty schemes: delivers a matching URL", () => {
      const ctx = createMockCtx({ config: { schemes: ["myapp"] } });
      const deliver = createDeliver(ctx);

      deliver("myapp://open");

      expect(ctx.emit).toHaveBeenCalledWith("deepLink:open", { url: "myapp://open" });
    });

    it("does not consume the launch-replay guard for a scheme-filtered URL", () => {
      const ctx = createMockCtx({ config: { schemes: ["myapp"] } });
      const deliver = createDeliver(ctx);

      deliver("other://open");

      expect(ctx.state.launchReplayDone).toBe(false);
    });
  });

  describe("launch-replay guard — dedup the one-time replay, nothing else", () => {
    it("drops the launch URL the first time it arrives (the replay after getCurrent read it)", () => {
      const ctx = createMockCtx();
      ctx.state.launchUrl = "myapp://open";
      const deliver = createDeliver(ctx);
      const subscriber = vi.fn();
      ctx.state.subscribers.add(subscriber);

      deliver("myapp://open");

      expect(ctx.emit).not.toHaveBeenCalled();
      expect(subscriber).not.toHaveBeenCalled();
      expect(ctx.state.launchReplayDone).toBe(true);
      expect(ctx.log.debug).toHaveBeenCalledWith("deepLink:launch-replay-dropped", {
        url: "myapp://open"
      });
    });

    it("delivers the same URL when it arrives again later — only the replay is dropped", () => {
      const ctx = createMockCtx();
      ctx.state.launchUrl = "myapp://open";
      const deliver = createDeliver(ctx);
      const subscriber = vi.fn();
      ctx.state.subscribers.add(subscriber);

      deliver("myapp://open");
      deliver("myapp://open");

      expect(ctx.emit).toHaveBeenCalledTimes(1);
      expect(ctx.emit).toHaveBeenCalledWith("deepLink:open", { url: "myapp://open" });
      expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it("delivers the same URL twice in a row when there was no launch URL at all", () => {
      const ctx = createMockCtx();
      const deliver = createDeliver(ctx);

      deliver("myapp://open");
      deliver("myapp://open");

      expect(ctx.emit).toHaveBeenCalledTimes(2);
    });

    it("delivers two different URLs, both of them", () => {
      const ctx = createMockCtx();
      const deliver = createDeliver(ctx);

      deliver("myapp://open");
      deliver("myapp://other");

      expect(ctx.emit).toHaveBeenCalledTimes(2);
      expect(ctx.emit).toHaveBeenNthCalledWith(1, "deepLink:open", { url: "myapp://open" });
      expect(ctx.emit).toHaveBeenNthCalledWith(2, "deepLink:open", { url: "myapp://other" });
    });

    it("a first delivery that is NOT the launch URL consumes the guard, so the launch URL is delivered later", () => {
      const ctx = createMockCtx();
      ctx.state.launchUrl = "myapp://open";
      const deliver = createDeliver(ctx);

      deliver("myapp://other");
      deliver("myapp://open");

      expect(ctx.emit).toHaveBeenCalledTimes(2);
      expect(ctx.state.launchReplayDone).toBe(true);
    });
  });

  describe("subscriber notification", () => {
    it("notifies every subscriber with the typed payload", () => {
      const ctx = createMockCtx();
      const deliver = createDeliver(ctx);
      const subscriberA = vi.fn();
      const subscriberB = vi.fn();
      ctx.state.subscribers.add(subscriberA);
      ctx.state.subscribers.add(subscriberB);

      deliver("myapp://open");

      expect(subscriberA).toHaveBeenCalledWith({ url: "myapp://open" });
      expect(subscriberB).toHaveBeenCalledWith({ url: "myapp://open" });
    });

    it("a throwing subscriber is caught and logged; other subscribers still get notified", () => {
      const ctx = createMockCtx();
      const deliver = createDeliver(ctx);
      const throwing = vi.fn(() => {
        throw new Error("island crashed");
      });
      const healthy = vi.fn();
      ctx.state.subscribers.add(throwing);
      ctx.state.subscribers.add(healthy);

      deliver("myapp://open");

      expect(throwing).toHaveBeenCalledTimes(1);
      expect(healthy).toHaveBeenCalledTimes(1);
      expect(ctx.log.error).toHaveBeenCalledWith(
        "deepLink:subscriber-failed",
        { url: "myapp://open" },
        expect.any(Error)
      );
    });

    it("wraps a non-Error subscriber throw into an Error for log.error", () => {
      const ctx = createMockCtx();
      const deliver = createDeliver(ctx);
      const throwing = vi.fn(() => {
        throw "plain string throw";
      });
      ctx.state.subscribers.add(throwing);

      deliver("myapp://open");

      const loggedError = vi.mocked(ctx.log.error).mock.calls[0]?.[2];
      expect(loggedError).toBeInstanceOf(Error);
      expect(loggedError?.message).toBe("plain string throw");
    });

    it("emits before notifying subscribers", () => {
      const ctx = createMockCtx();
      const order: string[] = [];
      ctx.emit = vi.fn(() => {
        order.push("emit");
      });
      const deliver = createDeliver(ctx);
      ctx.state.subscribers.add(() => {
        order.push("subscriber");
      });

      deliver("myapp://open");

      expect(order).toEqual(["emit", "subscriber"]);
    });
  });
});
