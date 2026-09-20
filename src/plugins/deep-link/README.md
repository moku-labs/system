# deep-link

> Complex plugin — deep-link launch URL + runtime delivery (Tauri `@tauri-apps/plugin-deep-link` /
> web launch URL) behind the `SystemResult` contract. Plugin name string: `deepLink`.

The only **push-driven** capability in `@moku-labs/system`, and therefore the only plugin that
declares `events`. Every other capability (`store`, `notify`, `clipboard`, `tray`) is pure
request/response; `deepLink` additionally delivers runtime OS events through a typed
`deepLink:open` event (per-plugin, `depends`-gated visibility — see Events below) and a local
`onOpen()` subscription.

At runtime it selects a provider once, based on `ctx.runtime.kind`:

- **Tauri provider** (`providers/tauri.ts`) — registers the OS `onOpenUrl` listener (lazily
  imported `@tauri-apps/plugin-deep-link`) as part of provider resolution; `dispose()` unregisters
  it at `app.stop()`. `getCurrent()` wraps the plugin's `getCurrent()` (first URL, or `null`) and
  forwards any *further* launch URLs down the delivery channel instead of dropping them.
- **Web provider** (`providers/web.ts`) — reads an explicit deep-link parameter off the page URL
  at construction time (`?deeplink=` or `#deeplink=`); no push deliveries occur on the web in v1
  (PWA `protocol_handlers`/`launchQueue` require installed-PWA manifest configuration outside this
  framework's runtime scope). `getCurrent()` resolves `ok(null)` for an ordinary page visit and
  under SSR where `location` is absent.

Both providers satisfy the same structural `DeepLinkProvider` interface (`providers/types.ts`).

## Usage

The plugin instance lives at the subpath export (D-011c):

```ts
import { createApp } from "@moku-labs/system";
import { deepLinkPlugin } from "@moku-labs/system/deep-link";

const system = createApp({
  plugins: [deepLinkPlugin],
  pluginConfigs: { deepLink: { schemes: ["myapp"] } }
});
await system.start();

// 1. Cold start — the URL the app was launched with.
const launch = await system.deepLink.getCurrent();
if (launch.ok && launch.value !== null) route(launch.value);

// 2. Warm delivery — URLs arriving while the app is running.
const unsub = system.deepLink.onOpen(({ url }) => route(url));
// later: unsub();
```

Types come from the root (`DeepLink` namespace, `SystemResult`) or the subpath
(`import type { DeepLink } from "@moku-labs/system/deep-link"`).

## API

| Method | Signature | Notes |
|--------|-----------|-------|
| `getCurrent` | `() => Promise<SystemResult<string \| null>>` | The URL the app was launched with, scheme-filtered. `ok(null)` when none, or when the launch URL's scheme is not in the allowlist (filtered URLs are logged at `debug`). |
| `onOpen` | `(cb: (payload: { url: string }) => void) => Unsubscribe` | Subscribe to runtime deliveries. Synchronous and always succeeds (subscription is local); whether deliveries ever *arrive* is provider/platform-dependent — no push deliveries occur on the web in v1. Returns an unsubscribe function. |

```ts
type Unsubscribe = () => void;
```

### SystemResult semantics (`getCurrent`)

| Situation | Result |
|-----------|--------|
| No launch URL (Tauri), or the page URL carries no `deeplink` parameter / SSR (web) | `ok(null)` |
| Web: the `deeplink` parameter is empty or not decodable | `ok(null)` (logged at `debug`) |
| Launch URL's scheme not in the non-empty allowlist | `ok(null)` (filtered, logged at `debug`) |
| Provider resolution failed (`@tauri-apps/plugin-deep-link` import or `onOpenUrl` registration rejected) | `err(kind, "unavailable", message)` |
| API called before `app.start()` | `err(kind, "unavailable", "app not started — call app.start() first")` |
| App stopped while the provider was still resolving | `err(kind, "unavailable", "stopped during resolution")` |
| Tauri `getCurrent()` throw | `err("tauri", "error", message)` |

`deepLink` never produces `"denied"` or `"unsupported"` — there is no permission surface, and both
kinds have a provider (the web absence is "no push channel", expressed as silence on `onOpen`, not
a typed error). Caught errors are also logged via `ctx.log.error`.

## The delivery pipeline

Every runtime OS delivery passes through a filter → launch-replay guard → emit + notify pipeline
(`createDeliver` in `api.ts`), wired as the provider's `onUrl` channel at `onStart`:

1. **Scheme filter** — when `config.schemes` is non-empty and the URL's scheme is not listed, the
   URL is dropped and logged at `debug` level. A filtered URL does not consume the guard below.
2. **Launch-replay guard** — the OS can deliver the launch URL to a listener that has just
   registered, and `getCurrent()` already handed the app that same URL. So the *first* delivery is
   dropped when it equals the launch URL `getCurrent()` recorded (`state.launchUrl`), and the
   window closes immediately (`state.launchReplayDone`). That is the only dedup there is:
   **a repeat of the same URL later is a real user action and is delivered.** The provider itself
   does not dedupe — the plugin layer is the single guard.
3. **Emit + notify** — the plugin emits the typed `deepLink:open` event, then calls every
   `onOpen()` subscriber. A subscriber that throws is caught and logged (`ctx.log.error`) so one
   bad island cannot break delivery to the others.

| Sequence | Outcome |
|----------|---------|
| `getCurrent()` → `myapp://a`, then the OS replays `myapp://a` | replay dropped (`deepLink:launch-replay-dropped`) |
| …then `myapp://a` arrives again | delivered |
| `myapp://a`, then `myapp://b` | both delivered |
| `myapp://a` twice with no launch URL read | both delivered |

## Configuration

```ts
type DeepLinkConfig = {
  /** Scheme allowlist (e.g. ["myapp"]). Empty = accept all delivered URLs. Default: []. */
  schemes: string[];
};
```

The allowlist applies to both `getCurrent()` (filtered → `ok(null)`) and runtime deliveries
(filtered → dropped). Each `schemes` entry must match `/^[a-z][a-z0-9+.-]*$/` (a lowercase URI
scheme). An invalid entry throws at `onInit`:

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
import { createApp, createPlugin } from "@moku-labs/system";
import { deepLinkPlugin } from "@moku-labs/system/deep-link";

const analyticsPlugin = createPlugin("analytics", {
  depends: [deepLinkPlugin],
  hooks: () => ({
    "deepLink:open": ({ url }) => track("deep_link_opened", { url })
  })
});

const system = createApp({ plugins: [deepLinkPlugin, analyticsPlugin] });
```

Island/app code that only needs the URL itself should prefer `onOpen()` — the event is
plumbing for other plugins, not the primary consumer-facing surface.

## Provider behavior differences

| Aspect | Tauri | Web |
|--------|-------|-----|
| Backing API | `@tauri-apps/plugin-deep-link` (lazy import) | `deeplink` parameter of `location.href`, read at resolution |
| `getCurrent()` | first URL from the plugin's `getCurrent()`, or `null`; further URLs are forwarded through `onOpen`/`deepLink:open` (once) | the decoded `deeplink` parameter, else `null` |
| Runtime deliveries (`onOpen` / `deepLink:open`) | yes — OS `onOpenUrl` listener registered at resolution | none in v1 (subscriptions succeed but never fire) |
| `dispose()` (at `app.stop()`) | unregisters the `onOpenUrl` listener | no-op |

## Integration notes

- **Dependencies:** none declared. Core APIs: `ctx.runtime` (provider selection), `ctx.log`
  (error/debug reporting) — always injected, never a `depends` edge.
- **Packages:** `@tauri-apps/plugin-deep-link` is an *optional* peerDependency, reached only via a
  lazy dynamic import inside the Tauri provider factory — pure-web bundles never include it.
- **Naming (D-007):** plugin name string `deepLink` (so `pluginConfigs: { deepLink: ... }` and
  `app.deepLink`), directory `deep-link/`, subpath `@moku-labs/system/deep-link`, event
  `deepLink:open`.
- **Scheme registration** (the OS knowing `myapp://` belongs to this app) is the native packager's
  manifest contract, not this plugin's — the allowlist here only filters what gets delivered.
- **Handing a web page a deep link:** put the link in a `deeplink` parameter, percent-encoded,
  in either the query or the hash — `https://app.example/?deeplink=myapp%3A%2F%2Fopen%3Fid%3D1`
  or `https://app.example/#deeplink=myapp%3A%2F%2Fopen`. The page's own address is never treated
  as a deep link: an ordinary visit must not look like an app launch, and `location.href` would
  otherwise fail the scheme allowlist or, with an empty allowlist, deliver every page load.
- **Testing:** the Tauri path requires `vi.mock("@tauri-apps/plugin-deep-link")` with
  `forceKind: "tauri"` (force-testing rule — see the runtime README); simulate deliveries by
  invoking the mocked `onOpenUrl` callback.

## Platform support matrix

| Platform | Launch URL (`getCurrent`) | Runtime deliveries (`onOpen`) |
|----------|---------------------------|--------------------------------|
| macOS | Yes | Yes |
| iOS / Android | Yes | Yes |
| **Windows / Linux** | Yes | **Not guaranteed without a cross-repo contract** — see below |
| Web | Only via an explicit `?deeplink=`/`#deeplink=` parameter | No push channel in v1 |

**Windows/Linux cross-repo contract (documented, not solvable here):** on Windows and Linux, the
OS delivers a deep-link URL as a CLI argument to a **new process instance**, not an `onOpenUrl`
event on the already-running app. Forwarding that URL into the running instance requires
`tauri-plugin-single-instance`, which is wired by the `@moku-labs/native` packager repo — outside
this framework's runtime scope. Until that repo wires single-instance forwarding, runtime
deliveries (`onOpen`) on Windows/Linux may never fire; only the initial `getCurrent()` launch URL
is reliable on those platforms.
