# runtime

> Core plugin (Micro tier) — synchronous shell/platform detection (`ctx.runtime.kind` / `ctx.runtime.platform`).

**Directory exception (D-008, user-approved):** this directory also hosts the framework's shared seam
modules — `result.ts` (public `SystemResult<T>` contract, re-exported via `src/index.ts`) and
`provider.ts` (internal resolution-lifecycle helper + per-app teardown registry keyed by the frozen
`ctx.global`, D-009). Sibling capability plugins import them via `../runtime/*`. These are pure,
stateless helper modules — not cross-plugin state access.

## Configuration

Both fields default to `null` (auto-detect). Override via `pluginConfigs: { runtime: { ... } }`
at the `createCoreConfig`/`createCore` level (see the force-testing rule below for `forceKind`).

```ts
type RuntimeConfig = {
  forceKind: RuntimeKind | null; // "tauri" | "web" | null
  forcePlatform: RuntimePlatform | null; // "macos" | "windows" | "linux" | "ios" | "android" | "unknown" | null
};
```

**Force-testing rule:** forcing `forcePlatform` alone is safe standalone. Forcing `forceKind: "tauri"`
in a Node/vitest process MUST be paired with `vi.mock("@tauri-apps/plugin-*")` (or a structural fake)
so provider construction never reaches a real IPC call.

## API

Injected as `ctx.runtime` on every regular plugin's context (and on the app instance itself):

```ts
ctx.runtime.kind; // "tauri" | "web"
ctx.runtime.platform; // "macos" | "windows" | "linux" | "ios" | "android" | "unknown"
```

Detection runs exactly once, synchronously, in `createState` — `kind`/`platform` never change for
the app's lifetime.

## Shared seam modules

- **`result.ts`** — the public `SystemResult<T>` contract (`ok`, `err`, `mapThrownToResult`,
  `unsupportedProvider`) every capability method returns. Re-exported through `src/index.ts`.
- **`provider.ts`** — the internal resolution-lifecycle helper (`startResolution`, `stopResolution`,
  `awaitProvider`) and its per-app teardown registry, keyed by the frozen `ctx.global` object
  (decision D-009). NOT exported from `src/index.ts` — free to evolve.
