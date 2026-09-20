import "fake-indexeddb/auto";

import { describe, expect, expectTypeOf, it } from "vitest";

import type { SystemErrorReason, SystemResult } from "../../../../index";
import { createApp } from "../../../../index";
import { storePlugin } from "../../index";

// No Tauri shell marker exists under Node/vitest, so runtime.kind auto-detects to
// "web" — the store plugin exercises the real IndexedDB provider via fake-indexeddb.
const createTestApp = (name = "test-db") =>
  createApp({
    plugins: [storePlugin],
    pluginConfigs: { store: { name } }
  });

describe("complex tier: store plugin (integration)", () => {
  describe("runtime: config validation", () => {
    it("onInit throws when store.name is empty", () => {
      expect(() =>
        createApp({
          plugins: [storePlugin],
          pluginConfigs: { store: { name: "" } }
        })
      ).toThrow("[system] store.name must be a file-safe namespace");
    });

    it("onInit throws when store.name contains path traversal", () => {
      expect(() =>
        createApp({
          plugins: [storePlugin],
          pluginConfigs: { store: { name: "../../escape" } }
        })
      ).toThrow('received "../../escape"');
    });

    it("onInit throws when store.name contains a path separator", () => {
      expect(() =>
        createApp({
          plugins: [storePlugin],
          pluginConfigs: { store: { name: "nested/name" } }
        })
      ).toThrow("[system] store.name must be a file-safe namespace");
    });

    it("onInit throws when store.name starts with a dot", () => {
      expect(() =>
        createApp({
          plugins: [storePlugin],
          pluginConfigs: { store: { name: ".hidden" } }
        })
      ).toThrow("[system] store.name must be a file-safe namespace");
    });

    it("onInit accepts letters, digits, dots, dashes and underscores in any case", () => {
      const app = createApp({
        plugins: [storePlugin],
        pluginConfigs: { store: { name: "My.App_1-v2" } }
      });

      expect(app.store).toBeDefined();
    });

    it("onInit succeeds with the default name", () => {
      const app = createApp({ plugins: [storePlugin] });

      expect(app.store).toBeDefined();
    });
  });

  describe("runtime: lifecycle", () => {
    it("full lifecycle: start → set/get/keys/delete/clear → stop", async () => {
      const app = createTestApp("lifecycle-db");
      await app.start();

      const setResult = await app.store.set("count", 1);
      expect(setResult).toEqual({ ok: true, value: undefined, provider: "web" });

      const getResult = await app.store.get<number>("count");
      expect(getResult).toEqual({ ok: true, value: 1, provider: "web" });

      const keysResult = await app.store.keys();
      expect(keysResult).toEqual({ ok: true, value: ["count"], provider: "web" });

      const deleteResult = await app.store.delete("count");
      expect(deleteResult).toEqual({ ok: true, value: undefined, provider: "web" });

      const afterDelete = await app.store.keys();
      expect(afterDelete).toEqual({ ok: true, value: [], provider: "web" });

      await app.store.set("x", 1);
      const clearResult = await app.store.clear();
      expect(clearResult).toEqual({ ok: true, value: undefined, provider: "web" });

      const afterClear = await app.store.keys();
      expect(afterClear).toEqual({ ok: true, value: [], provider: "web" });

      await app.stop();
    });

    it("API calls before app.start() resolve to 'unavailable'", async () => {
      const app = createTestApp("before-start-db");

      const result = await app.store.get("k");

      expect(result).toEqual({
        ok: false,
        provider: "web",
        reason: "unavailable",
        message: "app not started — call app.start() first"
      });
    });
  });

  describe("types: API signatures", () => {
    it("get<number> resolves to SystemResult<number | undefined>", async () => {
      const app = createTestApp("types-get-db");
      await app.start();

      expectTypeOf(app.store.get<number>("k")).resolves.toEqualTypeOf<
        SystemResult<number | undefined>
      >();

      await app.stop();
    });

    it("rejects a Date value at compile time (JsonValue constraint)", async () => {
      const app = createTestApp("types-date-db");

      // @ts-expect-error -- Date is not a JsonValue
      await app.store.set("k", new Date());

      expect(app).toBeDefined();
    });

    it("rejects a function value at compile time (JsonValue constraint)", async () => {
      const app = createTestApp("types-fn-db");

      // @ts-expect-error -- functions are not JsonValue
      await app.store.set("k", () => undefined);

      expect(app).toBeDefined();
    });

    it("narrows SystemResult via the ok discriminant", async () => {
      const app = createTestApp("types-narrow-db");
      await app.start();

      const result = await app.store.get<number>("count");
      if (result.ok) {
        expectTypeOf(result.value).toEqualTypeOf<number | undefined>();
      } else {
        expectTypeOf(result.reason).toEqualTypeOf<SystemErrorReason>();
      }

      await app.stop();
    });
  });
});
