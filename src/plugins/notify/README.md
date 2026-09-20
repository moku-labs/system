# notify

> Complex plugin — OS/browser notifications (Tauri plugin-notification / Web Notification API) behind the SystemResult contract.

The v1 core trio only — `isPermissionGranted` / `requestPermission` / `show`. The ~15 Tauri mobile
scheduling/channel methods are out of scope. Permission flow is **explicit by contract**: `show()`
NEVER prompts. If permission is not currently granted it returns `err("denied")` immediately —
the app must call `requestPermission()` deliberately (typically from a user gesture). This prevents
the anti-pattern of a silent OS prompt firing from a render path.

- **Tauri provider** (`providers/tauri.ts`) — `@tauri-apps/plugin-notification`, imported lazily
  inside the factory body. `show()` checks `isPermissionGranted()` itself (never
  `requestPermission()`), so it can never trigger the native prompt.
- **Web provider** (`providers/web.ts`) — the Web `Notification` API, read through a local
  structural type (this project's tsconfig has no DOM lib). Feature-probed at resolution: when the
  `Notification` global is absent (SSR, insecure context, old browser) the factory returns the
  shared `unsupportedProvider()` stand-in. `show()` reads `Notification.permission` itself — never
  calls `Notification.requestPermission()` — so it can never trigger the browser prompt either.

Both providers satisfy the same structural `NotifyProvider` interface (`providers/types.ts`), so
island/consumer code calling `app.notify.*` behaves identically regardless of which shell it runs in.

## Usage

The plugin instance lives at the subpath export (D-011c):

```ts
import { createApp } from "@moku-labs/system";
import { notifyPlugin } from "@moku-labs/system/notify";

const system = createApp({ plugins: [notifyPlugin] });
await system.start();

// Explicit permission flow — show() will NOT prompt for you.
const granted = await system.notify.isPermissionGranted();
if (granted.ok && !granted.value) {
  const req = await system.notify.requestPermission(); // explicit, user-gesture-driven
  if (!req.ok || !req.value) return;
}

await system.notify.show({ title: "Sync complete", body: "42 items updated" });
```

Islands branch on the typed absence/denial, never on the runtime:

```ts
const r = await system.notify.show({ title: "Done" });
if (!r.ok && r.reason === "denied") promptUserToEnableNotifications();
if (!r.ok && r.reason === "unsupported") hideNotifySettings(); // e.g. Notification API absent
```

Types come from the root (`Notify` namespace, `SystemResult`) or the subpath
(`import type { Notify } from "@moku-labs/system/notify"`).

## API

All methods are mounted at `app.notify` and return `Promise<SystemResult<...>>`.

| Method | Signature | Notes |
|--------|-----------|-------|
| `isPermissionGranted` | `() => Promise<SystemResult<boolean>>` | Reads the current permission state; never prompts. |
| `requestPermission` | `() => Promise<SystemResult<boolean>>` | The ONLY place a prompt may originate. `ok(true)` = granted, `ok(false)` = denied/dismissed (a returned signal, not an error). |
| `show` | `(options: NotifyOptions) => Promise<SystemResult<void>>` | Displays a notification. `err("denied")` when permission is not currently granted — **never prompts**. |

```ts
type NotifyOptions = {
  title: string;
  body?: string;
};
```

### SystemResult semantics

| Situation | Result |
|-----------|--------|
| Web: `Notification` global absent (SSR, insecure context, old browser) — every method | `err("web", "unsupported")` |
| Tauri: `window.Notification` absent inside the shell — `show()` only | `err("tauri", "unavailable", "window.Notification is unavailable in this webview")` |
| `show()` while permission is not granted (either provider) | `err(kind, "denied", "notification permission not granted")` — no prompt fires |
| `requestPermission()` prompt answered with denied/dismissed | `ok(false)` — a **returned** permission value, deliberately not an error |
| Provider resolution failed (`@tauri-apps/plugin-notification` import rejected) | `err(kind, "unavailable", message)` |
| API called before `app.start()` | `err(kind, "unavailable", "app not started — call app.start() first")` |
| App stopped while the provider was still resolving | `err(kind, "unavailable", "stopped during resolution")` |
| Method-time throw from either provider (incl. Tauri ACL throws — ambiguous, D-004) | `err(kind, "error", message)` |

`"denied"` is produced only from the providers' own **returned** permission signals
(`Notification.permission` / Tauri `isPermissionGranted()`), never guessed from a throw. Every
caught error is also logged via `ctx.log.error` with a `notify:{web|tauri}-{method}-failed` key.

**Permission caching (Tauri).** Each `isPermissionGranted()` plugin call is an IPC round-trip, so
`show()` would pay one per notification. The Tauri provider caches the granted state after the
first successful read; `requestPermission()` replaces it with the prompt's answer, and
`isPermissionGranted()` always reads through and refreshes it. A thrown read is never cached. If
the user changes the permission in OS settings while the app runs, call
`app.notify.isPermissionGranted()` to pick the new state up. The web provider needs no cache —
`Notification.permission` is a synchronous property.

## Configuration

None — no field has a real cross-provider meaning in v1 (title/body are per-call). `notify`
declares no `config`, so it is excluded from `pluginConfigs` entirely.

## Events

None — `notify` is pure request/response (`isPermissionGranted`/`requestPermission`/`show` via
`app.notify.*`).

## Provider behavior differences

| Aspect | Tauri | Web |
|--------|-------|-----|
| Backing API | `@tauri-apps/plugin-notification` (lazy import) | global `Notification` constructor |
| Availability probe | none (import failure → `"unavailable"`) | factory-time feature probe; absent global → all methods `"unsupported"` |
| Permission read | `isPermissionGranted()` plugin call, cached after the first read | `Notification.permission === "granted"` (a synchronous property read) |
| Prompt | `requestPermission()` plugin call (returned value mapped to `ok(boolean)`, and it refreshes the cache) | `Notification.requestPermission()` (returned value mapped to `ok(boolean)`) |
| `show()` guard | the cached granted state, then a `window.Notification` presence probe, then `sendNotification(options)` | reads `Notification.permission` before `new Notification(title, { body })` |
| `dispose()` | no-op | no-op |

## Integration notes

- **Dependencies:** none declared. `ctx.runtime` (provider selection) and `ctx.log` (error
  reporting) are core-plugin APIs, always injected — never a `depends` edge.
- **Packages:** `@tauri-apps/plugin-notification` is an *optional* peerDependency, reached only
  via a lazy dynamic import inside the Tauri provider factory — pure-web bundles never include it.
- **Call `requestPermission()` from a user gesture:** browsers increasingly ignore or auto-deny
  permission prompts not driven by user activation; the explicit flow exists so the prompt can be
  placed correctly.
- **Testing:** stub the web path with `vi.stubGlobal("Notification", fake)` +
  `forceKind: "web"`; the Tauri path requires `vi.mock("@tauri-apps/plugin-notification")` with
  `forceKind: "tauri"` (force-testing rule — see the runtime README).
