# runtime

> Core plugin (Micro tier) — synchronous shell/platform detection (`ctx.runtime.kind` / `ctx.runtime.platform`).

The single override point for the whole provider seam, mirroring `envPlugin`. Registered in
`src/config.ts` as the third core plugin (alongside `logPlugin` + `envPlugin`), so **consumers
never compose it** — every regular plugin's `ctx` carries `ctx.runtime` automatically. Each
capability plugin (`store`, `notify`, `clipboard`, `tray`, `deep-link`) branches on it exactly
once, at provider-resolution time; islands never branch on the runtime themselves.

Detection is import-free and SSR-safe: `detect.ts` touches `globalThis`/`navigator` only inside
function bodies, so importing this module under Node never throws.

- `kind` — `"tauri"` when either Tauri 2 shell marker is present on `globalThis`: the public
  `isTauri === true` flag or the internal `__TAURI_INTERNALS__` bridge. `"web"` otherwise.
- `platform` — from `navigator.userAgent` heuristics, checking device markers before broader OS
  markers (Android UA contains "Linux"; iOS UA contains "like Mac OS X"). An iPad in desktop
  mode reports a Macintosh UA, so a Macintosh UA that also reports `maxTouchPoints > 1` is
  `"ios"` — that is what keeps desktop-only capabilities (`tray`) off an iPad. `"unknown"` is the
  honest fallback, including SSR where `navigator` is absent.

**Directory exception (D-008, user-approved):** this directory also hosts the framework's shared
seam modules — `result.ts` (public `SystemResult<T>` contract, re-exported via `src/index.ts`) and
`provider.ts` (internal resolution-lifecycle helper; its teardown entry lives in each capability's
own plugin state). Sibling capability plugins import them via `../runtime/*`. These are pure,
stateless helper modules — not cross-plugin state access.

## Configuration

Both fields default to `null` (auto-detect).

```ts
type RuntimeConfig = {
  forceKind: RuntimeKind | null; // "tauri" | "web" | null — default: null
  forcePlatform: RuntimePlatform | null; // "macos" | "windows" | "linux" | "ios" | "android" | "unknown" | null — default: null
};
```

`runtime` is a **core plugin**, so its config is fixed at the framework layer — it is NOT
reachable through `createApp`'s `pluginConfigs` (which keys over regular capability plugins
only). The force overrides are used by the framework's own test suite, which composes the
core directly. Consumer tests make detection deterministic by stubbing the environment
**before** `app.start()` instead:

```ts
// Force "tauri": define a shell marker detectKind() reads (pair with @tauri-apps/* mocks).
vi.stubGlobal("__TAURI_INTERNALS__", {}); // or: vi.stubGlobal("isTauri", true)
// Force a platform: stub the navigator detectPlatform() reads.
vi.stubGlobal("navigator", { userAgent: "...Macintosh...", maxTouchPoints: 0 });
// Force "web": simply run without the markers (the default in vitest/Node).
```

**Force-testing rule:** forcing `forcePlatform` alone is safe standalone. Forcing `forceKind: "tauri"`
in a Node/vitest process MUST be paired with `vi.mock("@tauri-apps/plugin-*")` (or a structural fake)
so provider construction never reaches a real IPC call.

## API

Injected as `ctx.runtime` on every regular plugin's context. Immutable data properties (primitives
copied from state — not a leaked state reference):

```ts
type RuntimeApi = {
  readonly kind: RuntimeKind; // "tauri" | "web"
  readonly platform: RuntimePlatform; // "macos" | "windows" | "linux" | "ios" | "android" | "unknown"
};
```

Detection runs exactly once, synchronously, in `createState` — `kind`/`platform` never change for
the app's lifetime. The `"tauri"` + `"ios"`/`"android"` combination is what lets desktop-only
capabilities (`tray`) return a typed `"unsupported"` instead of failing at call time.

```ts
import { createPlugin } from "@moku-labs/system";

const probePlugin = createPlugin("probe", {
  api: ctx => ({ isNative: () => ctx.runtime.kind === "tauri" })
});
```

## Events

None — `runtime` is pure synchronous data; nothing ever changes after `createState`.

## Shared seam module: `result.ts` (public contract)

The uniform outcome contract every capability method returns — degraded, denied, or absent
capabilities are typed data, never a thrown surprise inside a webview. Programmer errors still
throw normally. Re-exported through the root `"@moku-labs/system"` (never through a plugin barrel):

```ts
import { ok, err } from "@moku-labs/system";
import type { SystemResult, SystemErr, SystemErrorReason, JsonValue } from "@moku-labs/system";
```

```ts
type SystemErrorReason = "unsupported" | "denied" | "unavailable" | "error";
type SystemOk<T> = { ok: true; value: T; provider: RuntimeKind };
type SystemErr = { ok: false; provider: RuntimeKind; reason: SystemErrorReason; message?: string };
type SystemResult<T> = SystemOk<T> | SystemErr;

ok<T>(value: T, provider: RuntimeKind): SystemOk<T>;
err(provider: RuntimeKind, reason: SystemErrorReason, message?: string): SystemErr;
```

`result.ts` also exports the `JsonValue` value domain (`string | number | boolean | null |
JsonValue[] | { [key: string]: JsonValue }`) used by `store`, plus two provider-side helpers that
are NOT part of the root export: `mapThrownToResult(provider, thrown, reason?)` folds any
thrown/rejected shape into a `SystemErr` preserving the raw message, and
`unsupportedProvider(provider, methods)` mechanically produces a stand-in provider whose every
listed method resolves `err(provider, "unsupported")` — the single source for both absence cases
(unsupported-by-kind: tray on web; unsupported-by-platform-within-kind: tray on Tauri mobile).

**Error-mapping table (binding for every provider implementation):**

| Signal | Maps to |
|---|---|
| `await import("@tauri-apps/plugin-*")` rejects; provider factory/`load()` throws; storage write-probe fails; API called before `app.start()`; app stopped mid-resolution | `"unavailable"` |
| Method-time throw/rejection from either provider (incl. ALL Tauri ACL errors — "not allowed" is ambiguous, D-004) | `"error"` |
| Unambiguous *returned* permission signal: web `Notification.permission !== "granted"` at `notify.show()`, `NotAllowedError` DOMException from `navigator.clipboard` | `"denied"` |
| Capability absent for the selected provider/platform | `"unsupported"` |

`mapThrownToResult` NEVER produces `"denied"` — Tauri ACL throws are ambiguous (D-004); `"denied"`
is reserved for unambiguous returned permission signals. Raw error text is always preserved in
`message` and logged via `ctx.log.error` (MC2) by the layer that catches it.

## Shared seam module: `provider.ts` (internal resolution lifecycle)

NOT exported from `src/index.ts` — internal machinery, free to evolve. Owns the capability
resolution lifecycle so "no synchronous `onStart` throw" and teardown safety are load-bearing
across all five capabilities from one implementation:

- **`startResolution(kind, ctx, load)`** — fire-and-forget, called from each
  capability's `onStart`. Synchronously stores an unawaited promise in `ctx.state.provider`;
  folds every `load()` rejection into the promise as an `"unavailable"` failure (the `onStart`
  body never throws); if the app stops mid-resolution, the late-arriving provider is disposed
  immediately and the promise resolves to `err(kind, "unavailable", "stopped during resolution")`.
  The `load` closure is where each capability reaches its Tauri provider module through a
  dynamic `import("./tauri")` — nothing outside `providers/tauri.ts` names `@tauri-apps/*`
  statically, so a pure-web bundle never has to resolve those specifiers.
- **`requirePeer(nativeName, peer, load)`** — wraps that `load` closure, so a missing optional
  `@tauri-apps/*` peer fails with a message that names the package instead of a raw
  `"Failed to fetch dynamically imported module …"`: `@tauri-apps/plugin-store is not installed.
  Add it to the app, or list "store" in @moku-labs/native config.system.` The wrapper only
  reacts to a module-resolution failure (including one re-wrapped by a bundler in its own error's
  `cause`); a fault raised inside a module that did load propagates untouched. The named
  `@moku-labs/native` entry is the Tauri plugin name, not this framework's plugin name (`notify` →
  `notification`, `clipboard` → `clipboard-manager`).
- **`stopResolution(capability, ctx, timeoutMs?)`** — the uniform `onStop` one-liner: flips the
  stopped sentinel, waits for a resolution still in flight (its folded failure is never rethrown),
  then awaits the resolved provider's `dispose()`. So `app.stop()` resolves only once every
  provider — including one that arrived late — has been disposed and its listeners are gone.
  The wait is **bounded** (default 5000 ms, injectable for tests): a dynamic import that never
  settles would otherwise hang `app.stop()` forever. On timeout the capability is reported through
  `ctx.log.warn("runtime:stop-resolution-timeout", { capability, timeoutMs })` — the logger is
  captured at `startResolution`, since `onStop`'s `TeardownContext` carries no core plugin APIs — and
  teardown moves on. The stopped sentinel outlives the call, so a provider that arrives after the
  timeout still disposes itself instead of installing into a stopped app.
- **`awaitProvider(state, kind)`** — awaited by every capability API method. A `null` slot (app
  never started) resolves to `err(kind, "unavailable", "app not started — call app.start() first")`
  instead of throwing.

The teardown entry lives in the capability's own state (`state.teardown`). `startResolution` writes
it in `onStart` and `stopResolution` reads it in `onStop`, which receives `{ global, config, state }`
since kernel 1.6. Each app instance has its own state, so instances never share resolution state.
This replaces the module-scope `WeakMap` of decision D-009.
