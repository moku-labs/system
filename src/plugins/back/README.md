# back

> Complex plugin — hardware Back press handlers and app exit (`@tauri-apps/api/app` on Android) behind the SystemResult contract.

Selection is **three-way**, once, on `ctx.runtime`:

- **kind `"tauri"`, platform `"android"`** — `providers/tauri.ts`, backed by a lazy
  `import("@tauri-apps/api/app")`: `onBackButtonPress` for the press, `exit(0)` to close the app.
- **kind `"tauri"`, any other platform** — the shared `unsupportedProvider("tauri", BACK_METHODS)`
  stand-in. iOS and desktop have no hardware Back, Apple discourages a programmatic exit, and the
  native registry row grants `core:app:allow-exit` on Android only (D-S05).
- **kind `"web"`** — `providers/web.ts`, the same stand-in for `"web"`. A history trap breaks the
  browser's own Back button, and `CloseWatcher` is Chromium only (P16).

On every provider `onPress` keeps the handlers. Only the Android provider ever calls them.

### The native listener follows the handlers (D-S04)

Registering any `onBackButtonPress` listener replaces the Android default (P14). So the plugin
registers the native listener **only while at least one handler exists and the app is started**.
The last remover unregisters it, and the system Back comes back. An app with no handler never
touches the system Back at all.

Every subscribe, every remove and `app.start()` chain one reconcile step onto a single queue. A fast
add/remove/add therefore never registers two listeners. A failed registration leaves the listener
off; the next `onPress` tries again.

### When no handler takes the press

The listener replaced the platform default, so the provider replays it: `history.back()` when the
webview can go back, otherwise `exit(0)`, which finishes the activity. This is the same thing
Android does without a listener (P14, `AppPlugin.kt`).

## Usage

The plugin instance lives at the subpath export:

```ts
import { createApp } from "@moku-labs/system";
import { backPlugin } from "@moku-labs/system/back";

const system = createApp({ plugins: [backPlugin] });
await system.start();

const off = system.back.onPress(() => {
  if (!popup.isOpen) return false; // not taken: older handlers, then the system default
  popup.close();
  return true; // taken
});

const result = await system.back.exit();
if (!result.ok && result.reason === "unsupported") showOwnBackButton();

off();
await system.stop();
```

Types come from the subpath (`import type { Back } from "@moku-labs/system/back"`).

## API

Both methods are mounted at `app.back`.

| Method | Signature | Notes |
|--------|-----------|-------|
| `onPress` | `(fn: () => boolean) => Unsubscribe` | `fn` returns whether it took the press. Handlers run newest first; the first `true` stops the chain. Local and synchronous, so it works before `app.start()`. A handler that throws is logged (`back:subscriber-failed`) and counts as `false`. |
| `exit` | `() => Promise<SystemResult<void>>` | Closes the app. Tauri Android: `exit(0)`. Everywhere else: `err(kind, "unsupported")`. |

`Unsubscribe` is `() => void`. It removes that registration only; a second call does nothing.

### SystemResult semantics (`exit`)

| Situation | Result |
|-----------|--------|
| Web, or Tauri on iOS / macOS / Windows / Linux / unknown | `err(kind, "unsupported")` |
| Tauri Android, exit requested | `ok(undefined, "tauri")` |
| Tauri Android, `@tauri-apps/api` older than 2.12 (no `exit`) | `err("tauri", "unavailable", "exit() needs @tauri-apps/api 2.12 or newer")` |
| Tauri Android, `exit` throws (incl. a missing `core:app:allow-exit`) | `err("tauri", "error", message)` — never `"denied"` (D-004) |
| Provider resolution failed (`@tauri-apps/api` not installed) | `err("tauri", "unavailable", message)` naming the package and the `back` row |
| Called before `app.start()` | `err(kind, "unavailable", "app not started — call app.start() first")` |
| Called after `app.stop()` | `err("tauri", "unavailable", "app stopped")` |

Log keys: `back:subscriber-failed`, `back:reconcile-failed`, `back:tauri-listen-failed`,
`back:tauri-unlisten-failed`, `back:default-exit-failed` (warn).

## Configuration

None. The plugin declares no `config` and is excluded from `pluginConfigs`.

## Events

None. Press handlers are callbacks registered with `onPress`; an event would be public forever.

## Provider behavior differences

| Aspect | Tauri Android | Tauri other platforms | Web |
|--------|---------------|-----------------------|-----|
| Backing API | `@tauri-apps/api/app` (lazy import) | none | none |
| `onPress` handlers | called on a press | kept, never called | kept, never called |
| Native listener | only while handlers exist | none | none |
| `exit()` | `exit(0)` | `"unsupported"` | `"unsupported"` |
| `dispose()` | unregisters the listener once | no-op | no-op |

## Integration notes

- **Dependencies:** none declared. `ctx.runtime` (provider selection) and `ctx.log` are core-plugin
  APIs, always injected.
- **Packages:** `@tauri-apps/api` `^2.12.0` is an *optional* peerDependency (`exit` is `@since
  2.12.0`, D-S06), reached only through a lazy dynamic import inside the Tauri provider factory.
  Pure-web bundles never include it.
- **Native permissions:** ACL `core:app:allow-exit`. The listener permissions are already in
  `core:default`. No Rust plugin: this is core API, Android only. `@moku-labs/native` grants it from
  the `config.system` entry named `back`.
- **Lifecycle:** `app.start()` resolves the provider and registers the listener if handlers were
  added before start. `app.stop()` unregisters it; a registration still in flight unregisters itself
  when it lands.
- **Testing:** the Tauri path needs `vi.mock("@tauri-apps/api/app")` with
  `runtime: { forceKind: "tauri", forcePlatform: "android" }` (force-testing rule, see the runtime
  README). The default press replays `history.back()`: stub it with
  `vi.stubGlobal("history", { back: vi.fn() })`.
