# store

> Complex plugin — JsonValue key-value persistence (Tauri store file / IndexedDB) behind the SystemResult contract.

The **template capability** for `@moku-labs/system`: every other capability plugin (`notify`,
`clipboard`, `tray`, `deep-link`) copies its `providers/` anatomy, `SystemResult` type-threading,
and resolution lifecycle. At runtime it selects a provider once, based on `ctx.runtime.kind`:

- **Tauri provider** (`providers/tauri.ts`) — persists to a store file (`${name}.json`) via a lazy
  `import("@tauri-apps/plugin-store")`, loaded with `autoSave` disabled. Every mutation
  (`set`/`delete`/`clear`) awaits `store.save()` before resolving `ok`, so a crash never loses a
  write the caller already saw succeed.
- **Web provider** (`providers/web.ts`) — persists to IndexedDB via `idb-keyval`
  (`createStore(name, "kv")`). Runs a one-time write-probe at resolution (`set` + `del` a sentinel
  key) so a near-zero-quota environment (e.g. Safari private browsing) surfaces as a deterministic
  `"unavailable"` at startup instead of a random throw on some later caller's method call.

Both providers satisfy the same structural `StoreProvider` interface (`providers/types.ts`), so
island/consumer code calling `app.store.*` behaves identically regardless of which shell it runs in.

## Usage

The plugin instance lives at the subpath export (D-011c) — importing from the root is not possible
(the root barrel would drag unused capabilities into pure-web bundles):

```ts
import { createApp } from "@moku-labs/system";
import { storePlugin } from "@moku-labs/system/store";

const system = createApp({
  plugins: [storePlugin],
  pluginConfigs: { store: { name: "my-app" } }
});
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

Types come from the root (`SystemResult`, `JsonValue`, the `Store` namespace) or from the subpath
(`import type { Store } from "@moku-labs/system/store"`).

## API

All methods are mounted at `app.store` and return `Promise<SystemResult<...>>` — environmental
failures are typed data, never a thrown surprise.

| Method | Signature | Notes |
|--------|-----------|-------|
| `get`    | `<T extends JsonValue = JsonValue>(key: string) => Promise<SystemResult<T \| undefined>>` | `ok(undefined)` when the key is absent. `T` is a compile-time assertion only — no runtime validation. |
| `set`    | `<T extends JsonValue>(key: string, value: T) => Promise<SystemResult<void>>` | Durable when the promise resolves `ok` (Tauri: awaited `save()`; IndexedDB: transaction-durable). Non-`JsonValue` values are compile errors. |
| `delete` | `(key: string) => Promise<SystemResult<void>>` | Returns `void`, not "existed" — cross-provider parity (idb-keyval cannot report existence cheaply, D-003). `ok` when removed or already absent. |
| `keys`   | `() => Promise<SystemResult<string[]>>` | All keys in the namespace. |
| `clear`  | `() => Promise<SystemResult<void>>` | Removes all keys in the namespace. |

Values are constrained to `JsonValue` (`string \| number \| boolean \| null \| JsonValue[] \| { [key: string]: JsonValue }`)
at compile time — Tauri's JSON store file and IndexedDB's structured clone round-trip types like
`Date`/`Map` differently, so restricting to JSON-safe values keeps identical call sites behaving
identically on both providers.

### SystemResult semantics

| Situation | Result |
|-----------|--------|
| Provider resolution failed (`@tauri-apps/plugin-store` import rejected, store file failed to load, IndexedDB write-probe threw) | `err(kind, "unavailable", message)` — every call returns it |
| API called before `app.start()` | `err(kind, "unavailable", "app not started — call app.start() first")` |
| App stopped while the provider was still resolving | `err(kind, "unavailable", "stopped during resolution")` |
| Method-time throw from either provider (incl. Tauri ACL "not allowed" throws — ambiguous, D-004) | `err(kind, "error", message)` |

`store` never produces `"denied"` (there is no permission surface) or `"unsupported"` (both
providers exist for both kinds). Every caught error is also logged via `ctx.log.error` with a
`store:{web|tauri}-{method}-failed` key.

## Configuration

```ts
type StoreConfig = {
  /** Namespace for persisted data. Default: "moku-system". File-safe, validated at onInit. */
  name: string;
};
```

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `name` | `string` | `"moku-system"` | Namespace. Must match `/^[a-z0-9][a-z0-9._-]*$/i` — letters, digits, `.`, `-`, `_`, starting with a letter or digit. |

`name` maps to the Tauri store filename (`${name}.json`) and the IndexedDB database name (with a
fixed `"kv"` object store). Because it becomes a filename segment under `app_data_dir`, anything
outside the pattern — an empty string, a path separator, a leading dot, `..` — is rejected at
`onInit` instead of silently writing outside the app's data directory:

```
[system] store.name must be a file-safe namespace — received "../../escape".
  Use letters, digits, ".", "-" or "_" and start with a letter or digit, e.g. pluginConfigs: { store: { name: "my-app" } }.
```

## Events

None — `store` is pure request/response (`get`/`set`/`delete`/`keys`/`clear` via `app.store.*`).

## Provider behavior differences

| Aspect | Tauri | Web |
|--------|-------|-----|
| Backing storage | `${name}.json` store file (`@tauri-apps/plugin-store`) | IndexedDB database `name`, object store `"kv"` (`idb-keyval`) |
| Durability | `save()` awaited after every mutation (`autoSave: false`) | IndexedDB transaction commit |
| Startup probe | none (store file load itself is the probe) | write-probe `set`+`del` of `__moku_probe__`; failure → `"unavailable"` |
| `dispose()` | `save()` then `close()` — the loaded `Store` is a Tauri `Resource`, so its Rust-side handle is released at `app.stop()` | no-op |

`dispose()` never rejects: a failing `save()` still runs the `close()`, and either failure is
reported through `ctx.log.error` (`store:tauri-dispose-save-failed` /
`store:tauri-dispose-close-failed`) rather than breaking the teardown chain.

## Integration notes

- **Dependencies:** none declared. `ctx.runtime` (provider selection) and `ctx.log` (error
  reporting) are core-plugin APIs, always injected — never a `depends` edge.
- **Native permissions:** ACL `store:default`; Rust side `tauri-plugin-store` with
  `tauri_plugin_store::Builder::default().build()`. `@moku-labs/native` codegens both from the
  `config.system` entry named `store`.
- **Packages:** `idb-keyval` is a regular dependency (dynamically imported only on the web path);
  `@tauri-apps/plugin-store` is an *optional* peerDependency, reached only via a lazy dynamic
  import inside the Tauri provider factory — pure-web bundles never include it.
- **Data does not migrate between providers:** the store file and the IndexedDB database are
  separate physical stores. An app run first on web and then packaged as native starts empty.
- **Testing:** force the web path with `pluginConfigs: { runtime: { forceKind: "web" } }` (+
  `fake-indexeddb`); forcing `forceKind: "tauri"` requires `vi.mock("@tauri-apps/plugin-store")`
  (force-testing rule — see the runtime README).
