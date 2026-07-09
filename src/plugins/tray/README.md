# tray

> Complex plugin — desktop system tray (Tauri desktop only; web and Tauri-mobile are typed-unsupported) behind the SystemResult contract.

Selection is **three-way**, both absence branches produced by the same shared `unsupportedProvider()`
factory (`../runtime/result.ts`) so an all-unsupported provider can never be silently hand-written:

- **kind `"web"`** — no browser tray API exists. Every method resolves `err("web", "unsupported")`.
- **kind `"tauri"` + platform `"ios"`/`"android"`** — Tauri mobile has no tray surface either. Every
  method resolves `err("tauri", "unsupported")`.
- **kind `"tauri"` desktop/unknown** — the real `providers/tauri.ts` provider, backed by lazy
  imports of `@tauri-apps/api/tray` + `@tauri-apps/api/menu`. The OS tray icon is created
  **lazily on the first mutating call** (`setMenu`/`setTooltip`/`setIcon`) — resolution itself
  never touches the OS. `destroy()`/`dispose()` destroy the cached icon idempotently; the next
  mutating call after a destroy recreates it lazily again.

The lazy-creation cache holds the *promise*, not just the resolved handle, so concurrent first
calls (e.g. via `Promise.all`) share one `TrayIcon.new()` instead of leaking an OS handle; a failed
creation clears the cache so the next call retries.

## Usage

The plugin instance lives at the subpath export (D-011c):

```ts
import { createApp } from "@moku-labs/system";
import { trayPlugin } from "@moku-labs/system/tray";

const system = createApp({
  plugins: [trayPlugin],
  pluginConfigs: { tray: { id: "my-app-tray" } }
});
await system.start();

const r = await system.tray.setMenu([{ id: "quit", text: "Quit", action: () => system.stop() }]);
if (!r.ok && r.reason === "unsupported") {
  hideTraySettings(); // web AND Tauri-mobile land here
}

await system.tray.setTooltip("My App");
await system.tray.setIcon("/icons/tray.png");
await system.tray.destroy();
```

Islands branch on the typed absence, never on the runtime. Types come from the root (`Tray`
namespace, `SystemResult`) or the subpath (`import type { Tray } from "@moku-labs/system/tray"`).

## API

All methods are mounted at `app.tray` and return `Promise<SystemResult<void>>`.

| Method | Signature | Notes |
|--------|-----------|-------|
| `setMenu` | `(items: TrayMenuItem[]) => Promise<SystemResult<void>>` | Replaces the tray menu. First mutating call creates the OS icon lazily. |
| `setTooltip` | `(text: string) => Promise<SystemResult<void>>` | Sets the hover tooltip text. |
| `setIcon` | `(iconPath: string) => Promise<SystemResult<void>>` | Sets the tray icon by path (path resolution is the native packager's contract). |
| `destroy` | `() => Promise<SystemResult<void>>` | Removes the tray icon. `ok` even if never created; the next mutating call recreates it. |

```ts
type TrayMenuItem = {
  id: string;
  text: string;
  enabled?: boolean; // defaults to true
  /** Runs in the webview when the item is clicked (Tauri desktop only). */
  action?: () => void;
};
```

### SystemResult semantics

| Situation | Result |
|-----------|--------|
| kind `"web"` (any platform) — every method | `err("web", "unsupported")` |
| kind `"tauri"` + platform `"ios"`/`"android"` — every method | `err("tauri", "unsupported")` |
| Provider resolution failed (`@tauri-apps/api` import rejected) | `err(kind, "unavailable", message)` |
| API called before `app.start()` | `err(kind, "unavailable", "app not started — call app.start() first")` |
| App stopped while the provider was still resolving | `err(kind, "unavailable", "stopped during resolution")` |
| Method-time throw on Tauri desktop (icon/menu creation, ACL "not allowed" — ambiguous, D-004) | `err("tauri", "error", message)` |

`tray` never produces `"denied"` — there is no permission surface, and thrown ACL errors map to
`"error"`. Every caught error is also logged via `ctx.log.error` with a
`tray:tauri-{method}-failed` key.

## Configuration

```ts
type TrayConfig = {
  /** OS-level tray identity — lets the native shell distinguish/replace this app's tray. Default: "moku-system". */
  id: string;
};
```

An empty/whitespace string throws at `onInit`:

```
[system] tray.id must be a non-empty string.
  Provide an id in pluginConfigs.
```

## Events

None — `tray` is pure request/response (`setMenu`/`setTooltip`/`setIcon`/`destroy` via `app.tray.*`).

## Provider behavior differences

| Aspect | Tauri desktop | Tauri mobile (ios/android) | Web |
|--------|---------------|----------------------------|-----|
| Backing API | `@tauri-apps/api/tray` + `@tauri-apps/api/menu` (lazy imports) | none | none |
| All methods | real OS tray | `err("tauri", "unsupported")` | `err("web", "unsupported")` |
| Icon lifecycle | created lazily on first mutating call; `destroy()`/`dispose()` remove it idempotently | n/a | n/a |
| `dispose()` (at `app.stop()`) | destroys the cached OS icon if present | no-op | no-op |

## Integration notes

- **Dependencies:** none declared. `ctx.runtime` (three-way selection, including **platform**
  gating) and `ctx.log` are core-plugin APIs, always injected — never a `depends` edge.
- **Packages:** `@tauri-apps/api` is an *optional* peerDependency, reached only via lazy dynamic
  imports inside the desktop provider factory — pure-web bundles never include it.
- **Icon paths** (`setIcon`) are resolved by the native shell — bundling/locating the icon asset
  is the `@moku-labs/native` packager's contract, not this framework's.
- **`app.stop()` cleans up:** the teardown registry awaits the provider's `dispose()`, so a tray
  icon created during the session is removed on orderly shutdown.
- **Testing:** the web branch needs no mocks (`forceKind: "web"`). Exercising the desktop branch
  requires `vi.mock("@tauri-apps/api/tray")` + `vi.mock("@tauri-apps/api/menu")` alongside
  `forceKind: "tauri"` (+ `forcePlatform: "macos"`); the mobile branch only needs
  `forcePlatform: "ios"`/`"android"` with the same kind mock rule.
