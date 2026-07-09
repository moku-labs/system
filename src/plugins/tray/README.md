# tray

> Complex plugin — desktop system tray (Tauri desktop only; web and Tauri-mobile are typed-unsupported) behind the SystemResult contract.

Selection is **three-way**, both absence branches produced by the same shared `unsupportedProvider()`
factory (`../runtime/result.ts`) so an all-unsupported provider can never be silently hand-written:

- **kind `"web"`** — no browser tray API exists. Every method resolves `err("web", "unsupported")`.
- **kind `"tauri"` + platform `"ios"`/`"android"`** — Tauri mobile has no tray surface either. Every
  method resolves `err("tauri", "unsupported")`.
- **kind `"tauri"` desktop/unknown** — the real `providers/tauri.ts` provider, backed by
  `@tauri-apps/api/tray` + `@tauri-apps/api/menu`. The OS tray icon is created **lazily on the first
  mutating call** (`setMenu`/`setTooltip`/`setIcon`) — resolution itself never touches the OS.
  `destroy()`/`dispose()` destroy the cached icon idempotently; the next mutating call after a
  destroy recreates it lazily again.

## API

All methods are mounted at `app.tray` and return `Promise<SystemResult<void>>`.

```ts
const system = createApp({ plugins: [trayPlugin] });
await system.start();

const r = await system.tray.setMenu([{ id: "quit", text: "Quit", action: () => system.stop() }]);
if (!r.ok && r.reason === "unsupported") {
  hideTraySettings(); // web AND Tauri-mobile land here
}

await system.tray.setTooltip("My App");
await system.tray.setIcon("/icons/tray.png");
await system.tray.destroy();
```

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
  enabled?: boolean;
  /** Runs in the webview when the item is clicked (Tauri desktop only). */
  action?: () => void;
};
```

Islands branch on the typed absence, never on the runtime:

```ts
const r = await system.tray.setMenu(items);
if (!r.ok && r.reason === "unsupported") hideTraySettings();
```

## Configuration

```ts
type TrayConfig = {
  /** OS-level tray identity — lets the native shell distinguish/replace this app's tray. Default: "moku-system". */
  id: string;
};
```

```ts
const system = createApp({
  plugins: [trayPlugin],
  pluginConfigs: { tray: { id: "my-app-tray" } }
});
```

An empty string throws at `onInit`:

```
[system] tray.id must be a non-empty string.
  Provide an id in pluginConfigs.
```

## Events

None — `tray` is pure request/response (`setMenu`/`setTooltip`/`setIcon`/`destroy` via `app.tray.*`).

## Dependencies

None. `ctx.runtime` (three-way provider selection, including platform gating) and `ctx.log` (error
reporting) are core-plugin APIs, always injected — never declared as a `depends` edge.
