# lifecycle

> Complex plugin — run code when the app goes to background and when it comes back
> (`visibilitychange` / Tauri `tauri://suspended` + `tauri://resumed`). Plugin name string: `lifecycle`.

Two local subscriptions, `onPause` and `onResume`. No `SystemResult`: subscribing is synchronous
and always succeeds. What changes per runtime is only *which sources* feed them.

Selection branches once on `ctx.runtime.kind`:

- **kind `"web"`** — `providers/web.ts`: the page's `visibilitychange`. Hidden → pause, visible →
  resume. No peer, no permission.
- **kind `"tauri"`** (every platform) — `providers/tauri.ts`: the same `visibilitychange` source
  **plus** the native `tauri://suspended` → pause and `tauri://resumed` → resume, from a lazy
  `import("@tauri-apps/api/event")` (D-S02).

Both providers use one shared source, `providers/visibility.ts` (`watchVisibility`), never a copy.
Both satisfy the structural `LifecycleProvider` interface (`providers/types.ts`): `dispose()` only,
because the sources are wired onto the signal when the provider is created.

## Usage

The plugin instance lives at the subpath export (D-S01):

```ts
import { createApp } from "@moku-labs/system";
import { lifecyclePlugin } from "@moku-labs/system/lifecycle";

const system = createApp({ plugins: [lifecyclePlugin] });
const offPause = system.lifecycle.onPause(() => game.pause());
const offResume = system.lifecycle.onResume(() => game.resume());
await system.start();

// later
offPause();
offResume();
await system.stop();
```

Types come from the root (`Lifecycle` namespace) or the subpath
(`import type { Lifecycle } from "@moku-labs/system/lifecycle"`).

## API

| Method | Signature | Notes |
|--------|-----------|-------|
| `onPause` | `(fn: () => void) => Unsubscribe` | `fn` runs each time the app goes to background. Local, synchronous, always succeeds. Allowed before `app.start()`. |
| `onResume` | `(fn: () => void) => Unsubscribe` | `fn` runs each time the app comes back. Same rules. |

```ts
type Unsubscribe = () => void;
```

## One trip, one call

Several sources can report the same trip. P15 measured iOS sending `tauri://suspended` 1.5 s
before `visibilitychange` hidden, and `tauri://resumed` plus visible within 2 ms. The plugin layer
(`createSignal` in `api.ts`) dedupes on transition:

| Sequence | Subscribers see |
|----------|-----------------|
| pause, pause | one pause |
| resume with no pause before it | nothing |
| pause, resume, pause | pause, resume, pause |
| iOS: suspended, hidden 1.5 s later, then resumed + visible | one pause, one resume |

The app starts in the foreground (`paused: false`), so every resume follows a pause.

Subscribers run in subscription order, from a snapshot taken when the transition starts: a
subscriber added during the round waits for the next transition, one removed during the round is
skipped. A subscriber that throws is logged (`lifecycle:subscriber-failed`, `ctx.log.error`) and
the others still run.

## Configuration

None. The plugin declares no `config` and is excluded from `pluginConfigs`.

## Events

None. Consumers use the callbacks; an event would be public forever.

## Provider behavior differences

| Aspect | Tauri | Web |
|--------|-------|-----|
| Sources | `visibilitychange` + `tauri://suspended` / `tauri://resumed` | `visibilitychange` |
| Page or window hidden at start | one pause | one pause |
| `@tauri-apps/api` missing, or `listen` rejected | `ctx.log.warn("lifecycle:tauri-events-unavailable", { message })`; runs on `visibilitychange` alone | — |
| SSR (no `document`) | native events only | no listener |
| `dispose()` (at `app.stop()`) | removes the DOM listener, calls each unlisten once; idempotent | removes the DOM listener |

## Platform support matrix

| Platform | Pause / resume source |
|----------|-----------------------|
| iOS / Android (Tauri) | native suspend/resume first, `visibilitychange` as backup (deduped) |
| macOS / Windows / Linux (Tauri) | `visibilitychange` (Rust emits Suspended/Resumed on mobile only) |
| Web | `visibilitychange` (tab switch, minimized window) |

## Integration notes

- **Dependencies:** none declared. `ctx.runtime` (provider selection) and `ctx.log` (warnings,
  subscriber failures) are core-plugin APIs, always injected, never a `depends` edge.
- **Packages:** `@tauri-apps/api` is an optional peerDependency, reached only through a lazy
  dynamic import inside the Tauri provider. Pure-web bundles never include it. A missing package
  is not an error here, so there is no `requirePeer` call.
- **Native permissions:** none beyond `core:default` (it carries `core:event:default`). No Rust
  side. Not listed in `@moku-labs/native` `config.system`.
- **Lifecycle:** `onStart` wires the listeners (fire-and-forget resolution); `onStop` removes every
  OS and DOM listener, so no subscriber runs after `app.stop()`.
- **Testing:** stub the page with `vi.stubGlobal("document", fake)` and `forceKind: "web"`; the
  Tauri path needs `vi.mock("@tauri-apps/api/event")` with `forceKind: "tauri"` (force-testing
  rule, see the runtime README). Fire a native event by calling the handler the mocked `listen`
  received.
