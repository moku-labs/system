# store

> Complex plugin — JsonValue key-value persistence (Tauri store file / IndexedDB) behind the SystemResult contract.

The **template capability** for `@moku-labs/system`: every other capability plugin (`notify`,
`clipboard`, `tray`, `deep-link`) copies its `providers/` anatomy, `SystemResult` type-threading,
and resolution lifecycle. At runtime it selects a provider once, based on `ctx.runtime.kind`:

- **Tauri provider** (`providers/tauri.ts`) — persists to a store file (`${name}.json`) via
  `@tauri-apps/plugin-store`, loaded with `autoSave` disabled. Every mutation (`set`/`delete`/`clear`)
  awaits `store.save()` before resolving `ok`, so a crash never loses a write the caller already
  saw succeed.
- **Web provider** (`providers/web.ts`) — persists to IndexedDB via `idb-keyval`. Runs a one-time
  write-probe at resolution (`set` + `del` a sentinel key) so a near-zero-quota environment (e.g.
  Safari private browsing) surfaces as a deterministic `"unavailable"` at startup instead of a
  random throw on some later caller's method call.

Both providers satisfy the same structural `StoreProvider` interface (`providers/types.ts`), so
island/consumer code calling `app.store.*` behaves identically regardless of which shell it runs in.

## API

All methods are mounted at `app.store` and return `Promise<SystemResult<...>>` — environmental
failures (unavailable, unsupported, error) are typed data, never a thrown surprise.

```ts
const system = createApp({ plugins: [storePlugin] });
await system.start();

const r = await system.store.get<number>("count");
if (r.ok) {
  console.log(r.value ?? 0);
} else if (r.reason === "unavailable") {
  fallbackToMemory(); // e.g. Safari private mode
}

await system.store.set("count", (r.ok ? (r.value ?? 0) : 0) + 1);
await system.store.delete("count");
await system.store.keys();
await system.store.clear();
```

| Method | Signature | Notes |
|--------|-----------|-------|
| `get`    | `<T extends JsonValue = JsonValue>(key: string) => Promise<SystemResult<T \| undefined>>` | `ok(undefined)` when the key is absent. `T` is a compile-time assertion only — no runtime validation. |
| `set`    | `<T extends JsonValue>(key: string, value: T) => Promise<SystemResult<void>>` | Durable when the promise resolves `ok` (Tauri: awaited `save()`; IndexedDB: transaction-durable). Non-`JsonValue` values are compile errors. |
| `delete` | `(key: string) => Promise<SystemResult<void>>` | Returns `void`, not "existed" — cross-provider parity (idb-keyval cannot report existence cheaply). |
| `keys`   | `() => Promise<SystemResult<string[]>>` | All keys in the namespace. |
| `clear`  | `() => Promise<SystemResult<void>>` | Removes all keys in the namespace. |

Values are constrained to `JsonValue` (`string \| number \| boolean \| null \| JsonValue[] \| { [key: string]: JsonValue }`)
at compile time — Tauri's JSON store file and IndexedDB's structured clone round-trip types like
`Date`/`Map` differently, so restricting to JSON-safe values keeps identical call sites behaving
identically on both providers.

## Configuration

```ts
type StoreConfig = {
  /** Namespace for persisted data. Default: "moku-system". Validated non-empty at onInit. */
  name: string;
};
```

```ts
const system = createApp({
  plugins: [storePlugin],
  pluginConfigs: { store: { name: "my-app" } }
});
```

`name` maps to the Tauri store filename (`${name}.json`) and the IndexedDB database name. An empty
string throws at `onInit`:

```
[system] store.name must be a non-empty string.
  Provide a name in pluginConfigs.
```

## Events

None — `store` is pure request/response (`get`/`set`/`delete`/`keys`/`clear` via `app.store.*`).

## Dependencies

None. `ctx.runtime` (provider selection) and `ctx.log` (error reporting) are core-plugin APIs,
always injected — never declared as a `depends` edge.
