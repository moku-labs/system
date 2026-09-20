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
| `getCurrent` | `() => Promise<SystemResult<string \| null>>` | The URL the app was launched with, scheme-filtered. `ok(null)` when none, when the launch URL's scheme is not in the allowlist, or when that URL already reached the app through `onOpen` (see the launch handover below). Filtered and already-delivered URLs are logged at `debug`. |
| `onOpen` | `(cb: (payload: { url: string }) => void) => Unsubscribe` | Subscribe to runtime deliveries. Synchronous and always succeeds (subscription is local); whether deliveries ever *arrive* is provider/platform-dependent — no push deliveries occur on the web in v1. Returns an unsubscribe function. |

```ts
type Unsubscribe = () => void;
```

### SystemResult semantics (`getCurrent`)

| Situation | Result |
|-----------|--------|
| No launch URL (Tauri), or the page URL carries no `deeplink` parameter / SSR (web) | `ok(null)` |
| Web: the `deeplink` parameter is empty or not decodable | `ok(null)` (logged at `debug`) |
| Web: the `deeplink` parameter carries `javascript:`, `data:`, `vbscript:`, `blob:` or `file:` | `ok(null)` (refused, logged at `debug`) |
| Launch URL's scheme not in the non-empty allowlist | `ok(null)` (filtered, logged at `debug`) |
| Launch URL already delivered through `onOpen` during the launch phase | `ok(null)` (logged at `debug`) |
| Provider resolution failed (`@tauri-apps/plugin-deep-link` import or `onOpenUrl` registration rejected) | `err(kind, "unavailable", message)` |
| API called before `app.start()` | `err(kind, "unavailable", "app not started — call app.start() first")` |
| App stopped while the provider was still resolving | `err(kind, "unavailable", "stopped during resolution")` |
| Tauri `getCurrent()` throw | `err("tauri", "error", message)` |

`deepLink` never produces `"denied"` or `"unsupported"` — there is no permission surface, and both
kinds have a provider (the web absence is "no push channel", expressed as silence on `onOpen`, not
a typed error). Caught errors are also logged via `ctx.log.error`.

## The delivery pipeline

Every runtime OS delivery passes through a filter → launch handover → emit + notify pipeline
(`createDeliver` in `api.ts`), wired as the provider's `onUrl` channel at `onStart`:

1. **Scheme filter** — when `config.schemes` is non-empty and the URL's scheme is not listed, the
   URL is dropped and logged at `debug` level. A filtered URL never touches the handover record.
2. **Launch handover** — see below.
3. **Emit + notify** — the plugin emits the typed `deepLink:open` event, then calls every
   `onOpen()` subscriber. A subscriber that throws is caught and logged (`ctx.log.error`) so one
   bad island cannot break delivery to the others.

### Launch handover — each launch URL reaches the app exactly once

**Each launch URL reaches the app exactly once, through whichever path sees it first.**

The OS and the app race. The OS can replay the launch URL onto the `onOpenUrl` listener the
moment it is registered — possibly *before* the app ever calls `getCurrent()`, possibly after. So
the guard is symmetric: both paths consult one small record of the launch URLs already handed
over (`state.handedOver`), kept only for the duration of the **launch phase**.

- A delivery equal to a URL `getCurrent()` already returned is dropped once, and logged at `debug`
  (`deepLink:launch-replay-dropped`).
- `getCurrent()` returns `ok(null)` for a launch URL that already reached the app through
  `onOpen`, and logs `deepLink:get-current-already-delivered` at `debug`.
- Repeated `getCurrent()` calls are stable: the same value every time, `ok(null)` included.

**The launch phase** starts at the first launch-phase URL and ends at whichever comes first:

- five seconds on the clock (the clock is injectable — `createDeliver(ctx, now)` /
  `createDeepLinkApi(ctx, now)` — so tests cross the boundary without timers; nothing is ever
  scheduled, the deadline is checked when a URL arrives); or
- a delivery of a URL the app already received through `onOpen` — that repeat is a fresh user
  action, not a launch replay.

Once it ends the record is dropped and **every delivery reaches the app, however often the same
URL arrives** — a user re-clicking the same link must work. The provider itself never dedupes;
the plugin layer is the single guard.

| Sequence | Outcome |
|----------|---------|
| `getCurrent()` → `myapp://a`, then the OS replays `myapp://a` | replay dropped |
| the OS delivers `myapp://a`, then `getCurrent()` | delivered through `onOpen`; `getCurrent()` → `ok(null)` |
| `getCurrent()` forwards extra launch URLs `myapp://b`, `myapp://c` | both delivered; a later replay of `myapp://a` still dropped once |
| `myapp://a` again, after the launch phase | delivered |
| `myapp://a`, then `myapp://b` | both delivered |
| `myapp://a` twice with no launch URL read | both delivered (the second ends the launch phase) |

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
- **Native permissions:** ACL `deep-link:default` plus `core:event:default` (part of
  `core:default`, needed for the `onOpenUrl` event channel); Rust side `tauri-plugin-deep-link`
  with `init()`, schemes declared in the Tauri config. Windows and Linux additionally need
  single-instance forwarding (see below). `@moku-labs/native` codegens these from the
  `config.system` entry named `deep-link`.
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
- **The `deeplink` parameter is attacker-controlled.** Anyone can mail a link to this app's own
  origin with any value in it. The web provider therefore refuses executable and local schemes —
  `javascript:`, `data:`, `vbscript:`, `blob:`, `file:` (case-insensitive, after trimming) —
  before the value leaves the provider, so an app running with an empty `schemes` allowlist can
  still never hand its router a `javascript:` URL. A refusal is logged at `debug` and reported as
  `ok(null)`. The configured `schemes` allowlist applies to this value exactly as it does to a
  native delivery: it is enforced once, in the plugin layer, for both paths.
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
