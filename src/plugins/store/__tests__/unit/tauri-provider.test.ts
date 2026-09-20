import { beforeEach, describe, expect, it, vi } from "vitest";

const { fakeStore, mockLoad } = vi.hoisted(() => {
  const fakeStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    keys: vi.fn(),
    clear: vi.fn(),
    save: vi.fn(),
    close: vi.fn()
  };
  const mockLoad = vi.fn(async () => fakeStore);
  return { fakeStore, mockLoad };
});

vi.mock("@tauri-apps/plugin-store", () => ({ load: mockLoad }));

import { createTauriStoreProvider } from "../../providers/tauri";
import { createMockLog } from "./test-helpers";

beforeEach(() => {
  mockLoad.mockClear();
  mockLoad.mockImplementation(async () => fakeStore);
  fakeStore.get.mockReset().mockResolvedValue(undefined);
  fakeStore.set.mockReset().mockResolvedValue(undefined);
  fakeStore.delete.mockReset().mockResolvedValue(true);
  fakeStore.keys.mockReset().mockResolvedValue([]);
  fakeStore.clear.mockReset().mockResolvedValue(undefined);
  fakeStore.save.mockReset().mockResolvedValue(undefined);
  fakeStore.close.mockReset().mockResolvedValue(undefined);
});

describe("createTauriStoreProvider", () => {
  it("loads the store file named after config.name with autoSave disabled", async () => {
    await createTauriStoreProvider({ name: "my-app" }, createMockLog());

    expect(mockLoad).toHaveBeenCalledWith("my-app.json", { defaults: {}, autoSave: false });
  });

  it("get returns ok(undefined) when the key is absent", async () => {
    fakeStore.get.mockResolvedValue(undefined);
    const provider = await createTauriStoreProvider({ name: "n" }, createMockLog());

    const result = await provider.get("missing");

    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
  });

  it("get returns the stored value", async () => {
    fakeStore.get.mockResolvedValue(42);
    const provider = await createTauriStoreProvider({ name: "n" }, createMockLog());

    const result = await provider.get<number>("count");

    expect(result).toEqual({ ok: true, value: 42, provider: "tauri" });
  });

  it("set awaits save() after the mutation", async () => {
    const order: string[] = [];
    fakeStore.set.mockImplementation(async () => {
      order.push("set");
    });
    fakeStore.save.mockImplementation(async () => {
      order.push("save");
    });
    const provider = await createTauriStoreProvider({ name: "n" }, createMockLog());

    const result = await provider.set("k", "v");

    expect(order).toEqual(["set", "save"]);
    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
  });

  it("delete awaits save() after the mutation", async () => {
    const order: string[] = [];
    fakeStore.delete.mockImplementation(async () => {
      order.push("delete");
      return true;
    });
    fakeStore.save.mockImplementation(async () => {
      order.push("save");
    });
    const provider = await createTauriStoreProvider({ name: "n" }, createMockLog());

    const result = await provider.delete("k");

    expect(order).toEqual(["delete", "save"]);
    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
  });

  it("clear awaits save() after the mutation", async () => {
    const order: string[] = [];
    fakeStore.clear.mockImplementation(async () => {
      order.push("clear");
    });
    fakeStore.save.mockImplementation(async () => {
      order.push("save");
    });
    const provider = await createTauriStoreProvider({ name: "n" }, createMockLog());

    const result = await provider.clear();

    expect(order).toEqual(["clear", "save"]);
    expect(result).toEqual({ ok: true, value: undefined, provider: "tauri" });
  });

  it("keys resolves ok with the store's key list", async () => {
    fakeStore.keys.mockResolvedValue(["a", "b"]);
    const provider = await createTauriStoreProvider({ name: "n" }, createMockLog());

    const result = await provider.keys();

    expect(result).toEqual({ ok: true, value: ["a", "b"], provider: "tauri" });
  });

  it("maps a method throw to reason 'error' with the message preserved, never 'denied'", async () => {
    fakeStore.set.mockRejectedValue(new Error("disk full"));
    const log = createMockLog();
    const provider = await createTauriStoreProvider({ name: "n" }, log);

    const result = await provider.set("k", "v");

    expect(result).toEqual({ ok: false, provider: "tauri", reason: "error", message: "disk full" });
    expect(result.ok ? undefined : result.reason).not.toBe("denied");
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("does not call save() when the mutating op itself throws", async () => {
    fakeStore.set.mockRejectedValue(new Error("boom"));
    const provider = await createTauriStoreProvider({ name: "n" }, createMockLog());

    await provider.set("k", "v");

    expect(fakeStore.save).not.toHaveBeenCalled();
  });

  it("maps a delete throw to reason 'error' with the message preserved, never 'denied'", async () => {
    fakeStore.delete.mockRejectedValue(new Error("delete unavailable"));
    const log = createMockLog();
    const provider = await createTauriStoreProvider({ name: "n" }, log);

    const result = await provider.delete("k");

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "delete unavailable"
    });
    expect(result.ok ? undefined : result.reason).not.toBe("denied");
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("does not call save() when delete() itself throws", async () => {
    fakeStore.delete.mockRejectedValue(new Error("boom"));
    const provider = await createTauriStoreProvider({ name: "n" }, createMockLog());

    await provider.delete("k");

    expect(fakeStore.save).not.toHaveBeenCalled();
  });

  it("wraps a non-Error throw into an Error for log.error while still mapping the result", async () => {
    fakeStore.get.mockRejectedValue("plain string rejection");
    const log = createMockLog();
    const provider = await createTauriStoreProvider({ name: "n" }, log);

    const result = await provider.get("k");

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "plain string rejection"
    });
    const loggedError = vi.mocked(log.error).mock.calls[0]?.[2];
    expect(loggedError).toBeInstanceOf(Error);
    expect(loggedError?.message).toBe("plain string rejection");
  });

  it("maps a get throw to reason 'error'", async () => {
    fakeStore.get.mockRejectedValue(new Error("read error"));
    const provider = await createTauriStoreProvider({ name: "n" }, createMockLog());

    const result = await provider.get("k");

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "read error"
    });
  });

  it("maps a keys throw to reason 'error' with the message preserved, never 'denied'", async () => {
    fakeStore.keys.mockRejectedValue(new Error("keys unavailable"));
    const log = createMockLog();
    const provider = await createTauriStoreProvider({ name: "n" }, log);

    const result = await provider.keys();

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "keys unavailable"
    });
    expect(result.ok ? undefined : result.reason).not.toBe("denied");
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("maps a clear throw to reason 'error' with the message preserved, never 'denied'", async () => {
    fakeStore.clear.mockRejectedValue(new Error("clear unavailable"));
    const log = createMockLog();
    const provider = await createTauriStoreProvider({ name: "n" }, log);

    const result = await provider.clear();

    expect(result).toEqual({
      ok: false,
      provider: "tauri",
      reason: "error",
      message: "clear unavailable"
    });
    expect(result.ok ? undefined : result.reason).not.toBe("denied");
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("does not call save() when clear() itself throws", async () => {
    fakeStore.clear.mockRejectedValue(new Error("boom"));
    const provider = await createTauriStoreProvider({ name: "n" }, createMockLog());

    await provider.clear();

    expect(fakeStore.save).not.toHaveBeenCalled();
  });

  it("dispose flushes with save() and then releases the Store resource with close()", async () => {
    const order: string[] = [];
    fakeStore.save.mockImplementation(async () => {
      order.push("save");
    });
    fakeStore.close.mockImplementation(async () => {
      order.push("close");
    });
    const provider = await createTauriStoreProvider({ name: "n" }, createMockLog());

    await expect(provider.dispose()).resolves.toBeUndefined();

    expect(order).toEqual(["save", "close"]);
  });

  it("dispose still closes the resource — and never rejects — when save() fails", async () => {
    fakeStore.save.mockRejectedValue(new Error("disk full"));
    const log = createMockLog();
    const provider = await createTauriStoreProvider({ name: "n" }, log);

    await expect(provider.dispose()).resolves.toBeUndefined();

    expect(fakeStore.close).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("dispose never rejects when close() fails", async () => {
    fakeStore.close.mockRejectedValue(new Error("already closed"));
    const log = createMockLog();
    const provider = await createTauriStoreProvider({ name: "n" }, log);

    await expect(provider.dispose()).resolves.toBeUndefined();

    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("answers every method with 'app stopped' once disposed instead of touching the closed store", async () => {
    const provider = await createTauriStoreProvider({ name: "n" }, createMockLog());
    await provider.dispose();
    fakeStore.get.mockClear();
    fakeStore.set.mockClear();
    fakeStore.delete.mockClear();
    fakeStore.keys.mockClear();
    fakeStore.clear.mockClear();

    const stopped = { ok: false, provider: "tauri", reason: "unavailable", message: "app stopped" };
    expect(await provider.get("k")).toEqual(stopped);
    expect(await provider.set("k", "v")).toEqual(stopped);
    expect(await provider.delete("k")).toEqual(stopped);
    expect(await provider.keys()).toEqual(stopped);
    expect(await provider.clear()).toEqual(stopped);

    expect(fakeStore.get).not.toHaveBeenCalled();
    expect(fakeStore.set).not.toHaveBeenCalled();
    expect(fakeStore.delete).not.toHaveBeenCalled();
    expect(fakeStore.keys).not.toHaveBeenCalled();
    expect(fakeStore.clear).not.toHaveBeenCalled();
  });

  it("dispose is idempotent — a second call never closes the freed resource twice", async () => {
    const provider = await createTauriStoreProvider({ name: "n" }, createMockLog());

    await provider.dispose();
    await provider.dispose();

    expect(fakeStore.close).toHaveBeenCalledTimes(1);
    expect(fakeStore.save).toHaveBeenCalledTimes(1);
  });

  it("propagates a factory-time (load) throw so it can be folded to 'unavailable' by startResolution", async () => {
    mockLoad.mockRejectedValueOnce(new Error("plugin not registered"));

    await expect(createTauriStoreProvider({ name: "n" }, createMockLog())).rejects.toThrow(
      "plugin not registered"
    );
  });
});
