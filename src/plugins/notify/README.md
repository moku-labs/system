# notify

> Complex plugin — OS/browser notifications (Tauri plugin-notification / Web Notification API) behind the SystemResult contract.

The v1 core trio only — `isPermissionGranted` / `requestPermission` / `show`. The ~15 Tauri mobile
scheduling/channel methods are out of scope. Permission flow is **explicit by contract**: `show()`
NEVER auto-prompts. If permission is not currently granted it returns `err("denied")` immediately —
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

## API

All methods are mounted at `app.notify` and return `Promise<SystemResult<...>>` — environmental
failures (unavailable, unsupported, denied, error) are typed data, never a thrown surprise.

```ts
const system = createApp({ plugins: [notifyPlugin] });
await system.start();

const granted = await system.notify.isPermissionGranted();
if (granted.ok && !granted.value) {
  const req = await system.notify.requestPermission(); // explicit, user-gesture-driven
  if (!req.ok || !req.value) return;
}

await system.notify.show({ title: "Sync complete", body: "42 items updated" });
```

| Method | Signature | Notes |
|--------|-----------|-------|
| `isPermissionGranted` | `() => Promise<SystemResult<boolean>>` | Reads the current permission state; never prompts. |
| `requestPermission` | `() => Promise<SystemResult<boolean>>` | The ONLY place a prompt may originate. `ok(true)` = granted, `ok(false)` = denied/dismissed (a returned signal, not a throw). |
| `show` | `(options: NotifyOptions) => Promise<SystemResult<void>>` | Displays a notification. `err("denied")` when permission is not currently granted — **never prompts**. |

```ts
type NotifyOptions = {
  title: string;
  body?: string;
};
```

Islands branch on the typed absence/denial, never on the runtime:

```ts
const r = await system.notify.show({ title: "Done" });
if (!r.ok && r.reason === "denied") promptUserToEnableNotifications();
if (!r.ok && r.reason === "unsupported") hideNotifySettings(); // e.g. Notification API absent
```

## Configuration

None — no field has a real cross-provider meaning in v1 (title/body are per-call). `notify`
declares no `config`, so it is excluded from `pluginConfigs` entirely.

## Events

None — `notify` is pure request/response (`isPermissionGranted`/`requestPermission`/`show` via
`app.notify.*`).

## Dependencies

None. `ctx.runtime` (provider selection) and `ctx.log` (error reporting) are core-plugin APIs,
always injected — never declared as a `depends` edge.
