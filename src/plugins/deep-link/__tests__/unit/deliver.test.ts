import { describe, expect, it, vi } from "vitest";

import { createDeliver } from "../../api";
import type { DeepLinkContext, DeepLinkState } from "../../types";
import { createMockLog } from "./test-helpers";

const createMockCtx = (overrides?: Partial<DeepLinkContext>): DeepLinkContext => ({
  config: { schemes: [], ...overrides?.config },
  state:
    overrides?.state ??
    // eslint-disable-next-line unicorn/no-null -- DeepLinkState.provider is typed `Promise<...> | null` (seam contract)
    ({ provider: null, lastUrl: null, subscribers: new Set() } satisfies DeepLinkState),
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

    it("does not update state.lastUrl for a scheme-filtered URL", () => {
      const ctx = createMockCtx({ config: { schemes: ["myapp"] } });
      const deliver = createDeliver(ctx);

      deliver("other://open");

      expect(ctx.state.lastUrl).toBeNull();
    });
  });

  describe("dedup — the upstream getCurrent() replay-bug regression test", () => {
    it("the same URL delivered twice results in exactly one emit and one subscriber notification", () => {
      const ctx = createMockCtx();
      const deliver = createDeliver(ctx);
      const subscriber = vi.fn();
      ctx.state.subscribers.add(subscriber);

      deliver("myapp://open");
      deliver("myapp://open");

      expect(ctx.emit).toHaveBeenCalledTimes(1);
      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(ctx.log.debug).toHaveBeenCalledWith("deepLink:delivery-deduped", {
        url: "myapp://open"
      });
    });

    it("a different URL after the first is delivered normally (state.lastUrl advances)", () => {
      const ctx = createMockCtx();
      const deliver = createDeliver(ctx);

      deliver("myapp://open");
      deliver("myapp://other");

      expect(ctx.emit).toHaveBeenCalledTimes(2);
      expect(ctx.emit).toHaveBeenNthCalledWith(1, "deepLink:open", { url: "myapp://open" });
      expect(ctx.emit).toHaveBeenNthCalledWith(2, "deepLink:open", { url: "myapp://other" });
      expect(ctx.state.lastUrl).toBe("myapp://other");
    });

    it("re-delivering the previous URL after a newer one has arrived is treated as a new delivery", () => {
      const ctx = createMockCtx();
      const deliver = createDeliver(ctx);

      deliver("myapp://a");
      deliver("myapp://b");
      deliver("myapp://a");

      expect(ctx.emit).toHaveBeenCalledTimes(3);
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
