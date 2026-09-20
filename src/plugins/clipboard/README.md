# clipboard

> Complex plugin — text-only clipboard read/write (`@tauri-apps/plugin-clipboard-manager` / `navigator.clipboard`) behind the SystemResult contract.

Selection is **two-way**, branching once on `ctx.runtime.kind`:

- **kind `"tauri"`** — `providers/tauri.ts`, backed by a lazy `import("@tauri-apps/plugin-clipboard-manager")`.
  Every thrown error maps to `"error"` — **never** `"denied"`; Tauri's ACL "not allowed" throws are
  ambiguous (they cover both a genuinely denied permission and other config problems), so guessing
  `"denied"` from a throw would be a false positive (D-004).
- **kind `"web"`** — `providers/web.ts`, backed by `navigator.clipboard`. **Feature-probed**, not
  `permissions.query`-probed: `clipboard-read`/`clipboard-write` permission names are inconsistently
  implemented across browsers, so this provider checks for the object/method's actual presence
  instead. Three tiers of absence are distinguished:
  - `navigator` itself absent (SSR) or `navigator.clipboard` absent (insecure context) → the shared
    `unsupportedProvider()` stand-in — every method resolves `err("web", "unsupported")`.
  - `navigator.clipboard` present but a specific method missing (e.g. Firefox lacking `readText`) →
    that method alone resolves `err("web", "unsupported")`; the other method still works.
  - A rejection whose `name` is `"NotAllowedError"` — the one unambiguous web-side "denied" signal
    — maps to `err("web", "denied", message)`. Any other throw maps to `"error"`. The check is a
    duck-type on `.name`, not `instanceof DOMException`: this package compiles without the DOM lib,
    and a webview that never populated the `DOMException` global still rejects with a
    `name`-carrying object.

Both providers satisfy the same structural `ClipboardProvider` interface (`providers/types.ts`), so
island/consumer code calling `app.clipboard.*` behaves identically regardless of which shell it runs in.

Image and HTML clipboard operations are explicitly out of scope for v1 — they are not isomorphic even
*within* Tauri (unsupported on Android/iOS natively). Every exposed method genuinely works, or has a
documented typed absence, on both providers.

## Usage

The plugin instance lives at the subpath export (D-011c):

```ts
import { createApp } from "@moku-labs/system";
import { clipboardPlugin } from "@moku-labs/system/clipboard";

const system = createApp({ plugins: [clipboardPlugin] });
await system.start();

const copy = await system.clipboard.writeText(shareUrl);
if (!copy.ok && copy.reason === "denied") {
  showManualCopyFallback(shareUrl); // user/browser refused
}

const paste = await system.clipboard.readText();
if (paste.ok) {
  insertAtCursor(paste.value);
} else if (paste.reason === "unsupported") {
  hidePasteButton(); // e.g. Firefox without readText, insecure context
}
```

Types come from the root (`Clipboard` namespace, `SystemResult`) or the subpath
(`import type { Clipboard } from "@moku-labs/system/clipboard"`).

## API

Both methods are mounted at `app.clipboard` and return `Promise<SystemResult<...>>`.

| Method | Signature | Notes |
|--------|-----------|-------|
| `readText`  | `() => Promise<SystemResult<string>>` | Reads the current clipboard text. Web: `err("denied")` on `NotAllowedError`; `err("unsupported")` where read is unavailable. |
| `writeText` | `(text: string) => Promise<SystemResult<void>>` | Writes plain text to the clipboard. |

### SystemResult semantics

| Situation | Result |
|-----------|--------|
| Web: `navigator`/`navigator.clipboard` absent (SSR, insecure context) — both methods | `err("web", "unsupported")` |
| Web: `navigator.clipboard` present but the specific method missing (e.g. Firefox `readText`) | `err("web", "unsupported")` for that method only |
| Web: rejection whose `name` is `"NotAllowedError"` (permission refused / no user activation) | `err("web", "denied", message)` — **web-only mapping**, duck-typed on `.name` |
| Web: any other throw | `err("web", "error", message)` |
| Tauri: ANY method-time throw (incl. ACL "not allowed") | `err("tauri", "error", message)` — never `"denied"` (D-004) |
| Provider resolution failed (`@tauri-apps/plugin-clipboard-manager` import rejected) | `err(kind, "unavailable", message)` |
| API called before `app.start()` | `err(kind, "unavailable", "app not started — call app.start() first")` |
| App stopped while the provider was still resolving | `err(kind, "unavailable", "stopped during resolution")` |

Non-denied errors are also logged via `ctx.log.error` with a
`clipboard:{web|tauri}-{read|write}-failed` key (`NotAllowedError` is an expected user decision,
not logged as an error).

**Log hygiene:** clipboard text is user data — passwords, tokens, private notes — so it is never
written to a log sink. A failed write logs `{ length }` only; a failed read logs no payload at all.

## Configuration

None — no field has a cross-provider meaning. The plugin declares no `config` and is excluded from
`pluginConfigs`.

## Events

None — `clipboard` is pure request/response (`readText`/`writeText` via `app.clipboard.*`).

## Provider behavior differences

| Aspect | Tauri | Web |
|--------|-------|-----|
| Backing API | `@tauri-apps/plugin-clipboard-manager` (lazy import) | `navigator.clipboard` |
| Availability probe | none (import failure → `"unavailable"`) | factory-time feature probe + per-method presence check |
| `"denied"` | never (all throws → `"error"`, D-004) | only from a rejection named `NotAllowedError` |
| User-gesture requirement | none (native ACL governs access) | `readText` typically requires user activation; browsers may show a paste prompt |
| `dispose()` | no-op | no-op |

## Integration notes

- **Dependencies:** none declared. `ctx.runtime` (provider selection) and `ctx.log` (error
  reporting) are core-plugin APIs, always injected — never a `depends` edge.
- **Packages:** `@tauri-apps/plugin-clipboard-manager` is an *optional* peerDependency, reached
  only via a lazy dynamic import inside the Tauri provider factory — pure-web bundles never
  include it.
- **Native permissions:** ACL `clipboard-manager:allow-read-text` and
  `clipboard-manager:allow-write-text` — `clipboard-manager:default` grants nothing; Rust side
  `tauri-plugin-clipboard-manager` with `init()`. `@moku-labs/native` codegens both from the
  `config.system` entry named `clipboard-manager`.
- **Call from a user gesture on web:** `readText` (and in some browsers `writeText`) succeeds only
  with user activation; outside one you should expect `"denied"`. Design the island to fall back
  (manual copy UI) rather than retry.
- **Testing:** stub the web path with `vi.stubGlobal("navigator", { clipboard: fake })` +
  `forceKind: "web"`; the Tauri path requires `vi.mock("@tauri-apps/plugin-clipboard-manager")`
  with `forceKind: "tauri"` (force-testing rule — see the runtime README).
