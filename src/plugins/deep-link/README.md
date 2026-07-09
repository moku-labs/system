# deep-link

> Complex plugin — deep-link launch URL + runtime delivery (Tauri `@tauri-apps/plugin-deep-link` /
> web launch URL) behind the `SystemResult` contract. Plugin name string: `deepLink`.

The only **push-driven** capability in `@moku-labs/system`, and therefore the only plugin that
declares `events`. Every other capability (`store`, `notify`, `clipboard`, `tray`) is pure
request/response, consumed via `require()`; `deepLink` additionally delivers runtime OS events
through a typed `deepLink:open` event (per-plugin, `depends`-gated visibility — see Events below)
and a local `onOpen()` subscription.

At runtime it selects a provider once, based on `ctx.runtime.kind`:

- **Tauri provider** (`providers/tauri.ts`) — registers the OS `onOpenUrl` listener (lazily
  imported `@tauri-apps/plugin-deep-link`) as part of provider resolution. `getCurrent()` wraps the
  plugin's `getCurrent()` (first URL, or `null`).
- **Web provider** (`providers/web.ts`) — captures the page's launch URL (`location.href`) at
  construction time; no push deliveries occur on the web in v1 (PWA `protocol_handlers`/
  `launchQueue` require installed-PWA manifest configuration outside this framework's runtime
  scope).

Both providers satisfy the same structural `DeepLinkProvider` interface (`providers/types.ts`).

## API

```ts
const system = createApp({ plugins: [deepLinkPlugin] });
await system.start();

const launch = await system.deepLink.getCurrent();
if (launch.ok && launch.value) route(launch.value);

const unsub = system.deepLink.onOpen(({ url }) => route(url));
// later: unsub();
```

| Method | Signature | Notes |
|--------|-----------|-------|
| `getCurrent` | `() => Promise<SystemResult<string \| null>>` | The URL the app was launched with, scheme-filtered. `ok(null)` when none, or when the launch URL's scheme is not in the allowlist. |
| `onOpen` | `(cb: (payload: { url: string }) => void) => Unsubscribe` | Subscribe to runtime deliveries. Synchronous and always succeeds (subscription is local); whether deliveries ever *arrive* is provider/platform-dependent — no push deliveries occur on the web in v1. Returns an unsubscribe function. |

## The delivery pipeline

Every runtime OS delivery passes through a filter → dedup → emit + notify pipeline
(`createDeliver` in `api.ts`), wired as the provider's `onUrl` channel at `onStart`:

1. **Scheme filter** — when `config.schemes` is non-empty and the URL's scheme is not listed, the
   URL is dropped and logged at `debug` level.
2. **Dedup** — `getCurrent()` on the upstream `@tauri-apps/plugin-deep-link` is
   **acknowledged-buggy**: it replays the last-ever URL on every `onOpenUrl()` registration (e.g.
   on remount/HMR). The plugin guards against this by comparing the incoming URL against
   `state.lastUrl`; an identical URL is dropped silently (and logged at `debug`).
3. **Emit + notify** — the plugin emits the typed `deepLink:open` event, then calls every
   `onOpen()` subscriber. A subscriber that throws is caught and logged (`ctx.log.error`) so one
   bad island cannot break delivery to the others.

## Configuration

```ts
type DeepLinkConfig = {
  /** Scheme allowlist (e.g. ["myapp"]). Empty = accept all delivered URLs. Validated at onInit. */
  schemes: string[];
};
```

```ts
const system = createApp({
  plugins: [deepLinkPlugin],
  pluginConfigs: { deepLink: { schemes: ["myapp"] } }
});
```

Each `schemes` entry must match `/^[a-z][a-z0-9+.-]*$/` (a lowercase URI scheme). An invalid entry
throws at `onInit`:

```
[system] deepLink.schemes entries must be lowercase URI schemes (e.g. "myapp").
  Fix "MyApp" in pluginConfigs.
```

## Events

`deepLink` is the only capability plugin that declares `events` — the push-driven nature of
runtime OS deliveries requires a notification channel in addition to `getCurrent()`/`onOpen()`.

```ts
type DeepLinkEvents = {
  /** A deep-link URL was delivered to the running app (post-dedup, post-filter). */
  "deepLink:open": { url: string };
};
```

Visibility follows the framework's per-plugin event model (`spec/07 §2/§5`): the plugin itself,
plus any other plugin that declares `depends: [deepLinkPlugin]`, can `hooks` on `deepLink:open`.
This event is **not** promoted to the framework-level `Events` map — opt-in plugins must not
advertise events for capabilities a consumer didn't compose.

```ts
const analyticsPlugin = createPlugin("analytics", {
  depends: [deepLinkPlugin],
  hooks: () => ({
    "deepLink:open": ({ url }) => track("deep_link_opened", { url })
  })
});
```

Island/app code that only needs the URL itself should prefer `onOpen()` — the event is
plumbing for other plugins, not the primary consumer-facing surface.

## Dependencies

None. Core APIs: `ctx.runtime` (provider selection), `ctx.log` (error/debug reporting) — always
injected, never declared as a `depends` edge.

## Platform support matrix

| Platform | Launch URL (`getCurrent`) | Runtime deliveries (`onOpen`) |
|----------|---------------------------|--------------------------------|
| macOS | Yes | Yes |
| iOS / Android | Yes | Yes |
| **Windows / Linux** | Yes | **Not guaranteed without a cross-repo contract** — see below |
| Web | Yes (page launch URL) | No push channel in v1 |

**Windows/Linux cross-repo contract (documented, not solvable here):** on Windows and Linux, the
OS delivers a deep-link URL as a CLI argument to a **new process instance**, not an `onOpenUrl`
event on the already-running app. Forwarding that URL into the running instance requires
`tauri-plugin-single-instance`, which is wired by the `@moku-labs/native` packager repo — outside
this framework's runtime scope. Until that repo wires single-instance forwarding, runtime
deliveries (`onOpen`) on Windows/Linux may never fire; only the initial `getCurrent()` launch URL
is reliable on those platforms.
