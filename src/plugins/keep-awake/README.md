# keepAwake

> Complex plugin — keeps the screen on through the Screen Wake Lock API (`navigator.wakeLock`), behind the SystemResult contract.

There is **one provider for both kinds** (D-S03): `providers/wake-lock.ts`, created by
`createWakeLockProvider(kind, log)`.

- **kind `"web"`** — `navigator.wakeLock` in the browser.
- **kind `"tauri"`** — the same `navigator.wakeLock`, inside the Tauri webview (P14). There is no
  `providers/tauri.ts`, no Tauri package import and no native code. `kind` only tags the results.

If a device run shows the webview lock fails, the fix is a small own Swift/Kotlin plugin. That is a
later change, and only after Alex agrees.

## Usage

The plugin instance lives at the subpath export:

```ts
import { createApp } from "@moku-labs/system";
import { keepAwakePlugin } from "@moku-labs/system/keep-awake";

const system = createApp({ plugins: [keepAwakePlugin] });
await system.start();

const r = await system.keepAwake.set(true);
if (!r.ok && r.reason === "denied") showHint("Battery saver blocks keep-awake");

await system.keepAwake.set(false);
```

Types come from the subpath (`import type { KeepAwake } from "@moku-labs/system/keep-awake"`).

## API

Mounted at `app.keepAwake`.

| Method | Signature | Notes |
|--------|-----------|-------|
| `set` | `(on: boolean) => Promise<SystemResult<void>>` | `true` holds the screen on while the page is visible. `false` lets it sleep. |

### The wish and page visibility

`set(true)` records a wish that outlives a hidden page:

1. The browser drops the lock when the page hides.
2. When the page is visible again and the wish still holds, the plugin takes the lock again.
3. A failed re-acquire is logged at warn (`keepAwake:reacquire-failed`). It never throws.

`set(false)` drops the wish and releases the lock. A lock that arrives after the wish was dropped is
released at once. Two `set(true)` calls in flight share one request.

### SystemResult semantics

| Situation | Result |
|-----------|--------|
| Lock taken, or already held | `ok(undefined)` |
| `set(false)`, held or not | `ok(undefined)` |
| No `navigator.wakeLock` (SSR, Firefox before 126, old webview) | `err(kind, "unsupported")` |
| `set(true)` on a hidden page | `err(kind, "unavailable", "page hidden — re-acquired when visible")`, wish kept |
| Rejection named `NotAllowedError` (battery saver, permissions policy) | `err(kind, "denied", message)`, duck-typed on `.name` |
| Any other rejection | `err(kind, "error", message)`, logged as `keepAwake:request-failed` |
| API called before `app.start()` | `err(kind, "unavailable", "app not started — call app.start() first")` |
| `set(true)` after `app.stop()` | `err(kind, "unavailable", "app stopped")` |

A failed `release()` is swallowed and logged as `keepAwake:release-failed`.

## Configuration

None. The plugin declares no `config`.

## Events

None. The game consumes the result of `set`; an event would be public forever.

## Lifecycle

- `onStart` starts provider resolution (fire-and-forget).
- `onStop` disposes the provider: it removes the `visibilitychange` listener, releases the lock and
  drops the wish.

## Integration notes

- **Dependencies:** none declared. `ctx.runtime` (kind) and `ctx.log` (failures) are core-plugin
  APIs.
- **Packages:** none. No peer dependency, no `@moku-labs/native` registry row.
- **Native permissions:** none. No ACL permission and no Rust side: `navigator.wakeLock` runs in the
  webview. Not listed in `@moku-labs/native` `config.system`.
- **Testing:** stub `navigator.wakeLock` and `document` with `vi.stubGlobal`. `forceKind: "tauri"`
  needs no `vi.mock`, because nothing native is imported.
