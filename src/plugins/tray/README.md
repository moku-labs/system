# tray

> Complex plugin — desktop system tray (Tauri desktop only; web and Tauri-mobile are typed-unsupported) behind the SystemResult contract.

Selection is **three-way**, both absence branches produced by the same shared `unsupportedProvider()`
factory (`../runtime/result.ts`) so an all-unsupported provider can never be silently hand-written:

- **kind `"web"`** — no browser tray API exists. Every method resolves `err("web", "unsupported")`.
- **kind `"tauri"` outside the desktop allowlist** — `"ios"`, `"android"` and `"unknown"` have no
  tray surface. Every method resolves `err("tauri", "unsupported")`. Gating is an **allowlist**
  (`macos`/`windows`/`linux`), not a mobile denylist: an unrecognized platform degrades to a typed
  absence instead of falling into the desktop provider and failing at call time. An iPad in
  desktop mode lands here too — `runtime` reports its Macintosh UA with touch points as `"ios"`.
- **kind `"tauri"` + platform `"macos"`/`"windows"`/`"linux"`** — the real `providers/tauri.ts`
  provider, reached through a dynamic `import("./tauri")` and backed by lazy
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
| kind `"tauri"` + platform outside `macos`/`windows`/`linux` (`ios`, `android`, `unknown`) — every method | `err("tauri", "unsupported")` |
| Provider resolution failed (`@tauri-apps/api` import rejected) | `err(kind, "unavailable", message)` |
| API called before `app.start()` | `err(kind, "unavailable", "app not started — call app.start() first")` |
| App stopped while the provider was still resolving | `err(kind, "unavailable", "stopped during resolution")` |
| The status-item image cannot be loaded (`tray.icon` file missing, or no default window icon) | `err("tauri", "unavailable", message)` — the message names `tray.icon` |
| Method-time throw on Tauri desktop (menu creation, ACL "not allowed" — ambiguous, D-004) | `err("tauri", "error", message)` |

`tray` never produces `"denied"` — there is no permission surface, and thrown ACL errors map to
`"error"`. Every caught error is also logged via `ctx.log.error` with a
`tray:tauri-{method}-failed` key.

## Configuration

```ts
type TrayConfig = {
  /** OS-level tray identity — lets the native shell distinguish/replace this app's tray. Default: "moku-system". */
  id: string;
  /** Status-item image: a path, or the raw bytes of one. Omit to use the app's default window icon. */
  icon?: string | Uint8Array | number[];
};
```

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | `string` | `"moku-system"` | OS-level tray identity. Non-empty, validated at `onInit`. |
| `icon` | `string \| Uint8Array \| number[]` (optional) | the app's default window icon | Image for the status item: a path the app process can actually read, or the image's raw bytes. Every form the native tray accepts except its own `Image` resource — a `@tauri-apps/api` type this package never puts in its public surface. |

An empty/whitespace `id` throws at `onInit`:

```
[system] tray.id must be a non-empty string.
  Provide an id in pluginConfigs.
```

### Why the default icon is the app's window icon, not a path

`TrayIcon.new({ icon })` accepts a path string, raw bytes, or an `Image`. A **path string is
resolved by the Rust side against the process working directory**, which a bundled app does not
control (launched from Finder it is `/`), so a relative path such as `icons/icon.png` — the entry
an `@moku-labs/native` app lists under `bundle.icon` — is not something this framework can rely on.
On macOS a status item created with no icon at all is invisible.

So when `tray.icon` is omitted, the provider asks the shell for the icon the app was packaged with,
via `defaultWindowIcon()` from `@tauri-apps/api/app` (an `Image` resource, no path guessing), and
passes it to `TrayIcon.new`. Set `tray.icon` only when the status item needs a *different* image
from the app icon — and then give it an absolute path (or the bytes), or a path relative to the
working directory you launch with during development.

That `Image` is a Rust-side resource, and `TrayIcon.new` only reads its rid — it never takes
ownership. So the provider closes the image it asked for, in a `finally` right after the status
item is created, whether creation succeeded or failed. A failing close is logged at `debug` and
never reaches the caller's result. A configured `tray.icon` is plain data the caller owns and is
never closed.

Either way the Tauri app needs the `image-png` (or `image-ico`) Cargo feature next to `tray-icon`;
the `@moku-labs/native` packager emits both.

## Events

None — `tray` is pure request/response (`setMenu`/`setTooltip`/`setIcon`/`destroy` via `app.tray.*`).

## Provider behavior differences

| Aspect | Tauri desktop (macos/windows/linux) | Tauri non-desktop (ios/android/unknown) | Web |
|--------|---------------|----------------------------|-----|
| Backing API | `@tauri-apps/api/tray` + `@tauri-apps/api/menu` (lazy imports) | none | none |
| All methods | real OS tray | `err("tauri", "unsupported")` | `err("web", "unsupported")` |
| Icon lifecycle | created lazily on first mutating call, with `tray.icon` or the default window icon; `destroy()`/`dispose()` remove it idempotently | n/a | n/a |
| Menu lifecycle | exactly one `Menu` alive at a time: `setMenu` closes the menu it replaced *after* the swap, and closes a menu that failed to attach. Swaps are serialized through one queue, so overlapping `setMenu` calls cannot resolve out of order and close the menu the OS is showing | n/a | n/a |
| `dispose()` (at `app.stop()`) | destroys the cached OS icon and closes the attached menu | no-op | no-op |

## Integration notes

- **Dependencies:** none declared. `ctx.runtime` (three-way selection, including the **platform**
  allowlist) and `ctx.log` are core-plugin APIs, always injected — never a `depends` edge.
- **Native permissions:** ACL `core:tray:default`, `core:menu:default`, `core:image:default`,
  `core:resources:default` — all part of `core:default`; Cargo features `tray-icon` + `image-png`,
  desktop targets only. `@moku-labs/native` codegens both from the `config.system` entry named
  `tray`.
- **Packages:** `@tauri-apps/api` is an *optional* peerDependency, reached only from
  `providers/tauri.ts`, which is itself only loaded by a dynamic `import()` on the desktop
  branch — pure-web bundles never include it and never have to resolve the specifier.
- **Icon paths** (`setIcon`, `tray.icon`) are read by the native shell relative to the process
  working directory — bundling/locating the icon asset is the `@moku-labs/native` packager's
  contract, not this framework's. The default needs no path at all (see Configuration).
- **Menus are Rust-side resources.** Every `Menu.new()` allocates one, plus a Channel per item with
  an `action`. The provider keeps a single menu alive and closes the replaced one on each
  `setMenu`, so a periodically refreshed menu does not accumulate handles. Concurrent
  `setMenu` calls are safe: they queue, and the last one issued is the one left showing.
- **`app.stop()` cleans up:** the teardown registry awaits the provider's `dispose()`, so a tray
  icon created during the session is removed on orderly shutdown.
- **Testing:** the web branch needs no mocks (`forceKind: "web"`). Exercising the desktop branch
  requires `vi.mock("@tauri-apps/api/tray")` + `vi.mock("@tauri-apps/api/menu")` alongside
  `forceKind: "tauri"` (+ `forcePlatform: "macos"`); the absent branch only needs
  `forcePlatform: "ios"`/`"android"`/`"unknown"` with the same kind mock rule.
