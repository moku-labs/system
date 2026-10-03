import { afterEach, describe, expect, it, vi } from "vitest";

import { watchVisibility } from "../../providers/visibility";
import { createFakeDocument } from "./test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("watchVisibility", () => {
  it("adds one visibilitychange listener", () => {
    const doc = createFakeDocument();
    vi.stubGlobal("document", doc);

    watchVisibility(vi.fn());

    expect(doc.listenerCount()).toBe(1);
    expect(doc.addEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });

  it("reports pause when the page is hidden and resume when it is visible again", () => {
    const doc = createFakeDocument();
    vi.stubGlobal("document", doc);
    const signal = vi.fn();
    watchVisibility(signal);

    doc.setVisibility("hidden");
    doc.setVisibility("visible");

    expect(signal.mock.calls).toEqual([["pause"], ["resume"]]);
  });

  it("reports pause once when the page is already hidden at call time", () => {
    vi.stubGlobal("document", createFakeDocument("hidden"));
    const signal = vi.fn();

    watchVisibility(signal);

    expect(signal.mock.calls).toEqual([["pause"]]);
  });

  it("reports nothing at call time when the page is visible", () => {
    vi.stubGlobal("document", createFakeDocument("visible"));
    const signal = vi.fn();

    watchVisibility(signal);

    expect(signal).not.toHaveBeenCalled();
  });

  it("the remover detaches the listener: later changes report nothing", () => {
    const doc = createFakeDocument();
    vi.stubGlobal("document", doc);
    const signal = vi.fn();

    const stopWatching = watchVisibility(signal);
    stopWatching();
    doc.setVisibility("hidden");

    expect(doc.listenerCount()).toBe(0);
    expect(signal).not.toHaveBeenCalled();
  });

  it("without a document (SSR) watches nothing and the remover is harmless", () => {
    const signal = vi.fn();

    const stopWatching = watchVisibility(signal);

    expect(() => stopWatching()).not.toThrow();
    expect(signal).not.toHaveBeenCalled();
  });
});
