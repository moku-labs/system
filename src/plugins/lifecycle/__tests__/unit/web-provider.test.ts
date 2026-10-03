import { afterEach, describe, expect, it, vi } from "vitest";

import { createWebLifecycleProvider } from "../../providers/web";
import { createFakeDocument } from "./test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createWebLifecycleProvider", () => {
  describe("with a fake document", () => {
    it("hidden → pause, visible → resume", async () => {
      const doc = createFakeDocument();
      vi.stubGlobal("document", doc);
      const signal = vi.fn();
      await createWebLifecycleProvider(signal);

      doc.setVisibility("hidden");
      doc.setVisibility("visible");

      expect(signal.mock.calls).toEqual([["pause"], ["resume"]]);
    });

    it("a page hidden at creation reports one pause", async () => {
      vi.stubGlobal("document", createFakeDocument("hidden"));
      const signal = vi.fn();

      await createWebLifecycleProvider(signal);

      expect(signal.mock.calls).toEqual([["pause"]]);
    });

    it("dispose removes the listener: later changes report nothing", async () => {
      const doc = createFakeDocument();
      vi.stubGlobal("document", doc);
      const signal = vi.fn();
      const provider = await createWebLifecycleProvider(signal);

      await provider.dispose();
      doc.setVisibility("hidden");

      expect(doc.listenerCount()).toBe(0);
      expect(signal).not.toHaveBeenCalled();
    });

    it("dispose is idempotent", async () => {
      vi.stubGlobal("document", createFakeDocument());
      const provider = await createWebLifecycleProvider(vi.fn());

      await provider.dispose();

      await expect(provider.dispose()).resolves.toBeUndefined();
    });
  });

  describe("without a document (SSR)", () => {
    it("resolves, reports nothing, and dispose is a no-op", async () => {
      const signal = vi.fn();

      const provider = await createWebLifecycleProvider(signal);

      await expect(provider.dispose()).resolves.toBeUndefined();
      expect(signal).not.toHaveBeenCalled();
    });
  });
});
