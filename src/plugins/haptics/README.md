# haptics

> Complex plugin — haptic feedback (`@tauri-apps/plugin-haptics` on iOS and Android, `navigator.vibrate` on the web) behind the SystemResult contract.

Selection is **three-way**, made once in `providers/index.ts` from `ctx.runtime`:

- **kind `"tauri"`, platform `ios` or `android`** — `providers/tauri.ts`, backed by a lazy
  `import("@tauri-apps/plugin-haptics")`. Each method calls one native command. A command that
  resolves `{ status: "error", error }` is logged and answers `"error"` with the raw payload. A
  thrown error answers `"error"` too, **never** `"denied"`: a Tauri ACL refusal is ambiguous
  (D-004).
- **kind `"tauri"`, any other platform** — the shared `unsupportedProvider("tauri", HAPTICS_METHODS)`
  stand-in. The native plugin does nothing on desktop, and the `@moku-labs/native` registry row
  registers it on mobile only (D-S05). The plugin package is never imported here.
- **kind `"web"`** — `providers/web.ts`, backed by `navigator.vibrate`. **Feature-probed** once,
  when the provider is created. No `vibrate` (iOS Safari, WKWebView, SSR) → the shared
  `unsupportedProvider("web", HAPTICS_METHODS)` stand-in. `vibrate` answering `false` means the
  page has no user gesture yet (sticky user activation, P16) → `"unavailable"`.

The API never branches on the runtime. Island code calls `app.haptics.*` the same way in every
shell.

## Usage

The plugin instance lives at the subpath export (D-S01):

```ts
import { createApp } from "@moku-labs/system";
import { hapticsPlugin } from "@moku-labs/system/haptics";

const system = createApp({ plugins: [hapticsPlugin] });
await system.start();

await system.haptics.impact("light");
await system.haptics.notify("success");

const tick = await system.haptics.selection();
if (!tick.ok && tick.reason === "unsupported") {
  hideHapticsToggle(); // iOS Safari, Tauri desktop
}
```

Types come from the root (`Haptics` namespace, `SystemResult`) or the subpath
(`import type { Haptics } from "@moku-labs/system/haptics"`).

## API

All methods are mounted at `app.haptics` and return `Promise<SystemResult<void>>`.

| Method | Signature | Notes |
|--------|-----------|-------|
| `impact` | `(kind: ImpactKind) => Promise<SystemResult<void>>` | One tap. `ImpactKind = "light" \| "medium" \| "heavy"`. |
| `notify` | `(kind: NotifyKind) => Promise<SystemResult<void>>` | The pattern for an outcome. `NotifyKind = "success" \| "warning" \| "error"`. |
| `selection` | `() => Promise<SystemResult<void>>` | The tick for a changed selection. |

Tauri also knows the impact styles `"soft"` and `"rigid"`. They are left out on purpose: the web
and Android cannot tell them apart from the other three.

### Web patterns

One table in `providers/web.ts`, in milliseconds. A number is one pulse; an array alternates
pulse and pause.

| Call | Pattern |
|------|---------|
| `impact("light")` / `("medium")` / `("heavy")` | `10` / `20` / `35` |
| `selection()` | `5` |
| `notify("success")` | `[15, 60, 15]` |
| `notify("warning")` | `[30, 60, 30]` |
| `notify("error")` | `[40, 60, 40, 60, 40]` |

### SystemResult semantics

| Situation | Result |
|-----------|--------|
| Tauri iOS / Android, command played | `ok(undefined, "tauri")` |
| Tauri iOS / Android, command resolved `{ status: "error", error }` | `err("tauri", "error", String(error))`, logged as `haptics:tauri-failed` |
| Tauri iOS / Android, command threw (incl. an ACL refusal) | `err("tauri", "error", message)`, logged as `haptics:tauri-failed` — never `"denied"` |
| Tauri on macOS, Windows, Linux or an unknown platform | `err("tauri", "unsupported")` |
| Web, `navigator.vibrate` accepted the pattern | `ok(undefined, "web")` |
| Web, `navigator` or `navigator.vibrate` absent (SSR, iOS Safari, WKWebView) | `err("web", "unsupported")` |
| Web, `navigator.vibrate` answered `false` (no user gesture yet) | `err("web", "unavailable", "vibrate refused — needs a user gesture first")`, not logged |
| Web, `navigator.vibrate` threw | `err("web", "error", message)`, logged as `haptics:web-failed` |
| Provider resolution failed (`@tauri-apps/plugin-haptics` not installed) | `err("tauri", "unavailable", message)` naming the package |
| API called before `app.start()` | `err(kind, "unavailable", "app not started — call app.start() first")` |

Every log entry carries `{ method }` (`"impact"`, `"notify"` or `"selection"`).

## Configuration

None. No field has a meaning on every provider. The plugin declares no `config` and is excluded
from `pluginConfigs`.

## Events

None. `haptics` is pure request/response through `app.haptics.*`.

## Provider behavior differences

| Aspect | Tauri (iOS / Android) | Web |
|--------|-----------------------|-----|
| Backing API | `@tauri-apps/plugin-haptics` (lazy import) | `navigator.vibrate` |
| Availability probe | platform allowlist; import failure → `"unavailable"` | factory-time probe for `vibrate` |
| User-gesture requirement | none | sticky user activation; before it → `"unavailable"` |
| `"denied"` | never | never |
| `dispose()` | no-op | no-op |

## Integration notes

- **Dependencies:** none declared. `ctx.runtime` (provider selection) and `ctx.log` (failure
  reports) are core-plugin APIs, always injected.
- **Packages:** `@tauri-apps/plugin-haptics` is an *optional* peerDependency, reached only through
  a dynamic import inside the Tauri provider factory. Pure-web bundles never include it.
- **Native permissions:** ACL `haptics:allow-impact-feedback`, `haptics:allow-notification-feedback`,
  `haptics:allow-selection-feedback` and `haptics:allow-vibrate` (the plugin has no default set).
  Rust side `tauri-plugin-haptics` with `init()`, iOS and Android only. `@moku-labs/native`
  codegens both from the `config.system` entry named `haptics`.
- **Call from a user gesture on web:** a browser refuses `vibrate` until the page has had one.
  Treat `"unavailable"` as "try again after the next tap", not as a fault.
- **Testing:** stub the web path with `vi.stubGlobal("navigator", { vibrate: fake })` +
  `forceKind: "web"`. The Tauri path needs `vi.mock("@tauri-apps/plugin-haptics")` with
  `forceKind: "tauri"` and `forcePlatform: "ios"` or `"android"` (force-testing rule, see the
  runtime README).
