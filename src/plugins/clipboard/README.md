# clipboard

> Complex plugin — text-only clipboard read/write (`@tauri-apps/plugin-clipboard-manager` / `navigator.clipboard`) behind the SystemResult contract.

Selection is **two-way**, branching once on `ctx.runtime.kind`:

- **kind `"tauri"`** — `providers/tauri.ts`, backed by a lazy `import("@tauri-apps/plugin-clipboard-manager")`.
  Every thrown error maps to `"error"` — **never** `"denied"`; Tauri's ACL "not allowed" throws are
  ambiguous (they cover both a genuinely denied permission and other config problems), so guessing
  `"denied"` from a throw would be a false positive.
- **kind `"web"`** — `providers/web.ts`, backed by `navigator.clipboard`. **Feature-probed**, not
  `permissions.query`-probed: `clipboard-read`/`clipboard-write` permission names are inconsistently
  implemented across browsers, so this provider checks for the object/method's actual presence
  instead. Three tiers of absence are distinguished:
  - `navigator` itself absent (SSR) or `navigator.clipboard` absent (insecure context) → the shared
    `unsupportedProvider()` stand-in — every method resolves `err("web", "unsupported")`.
  - `navigator.clipboard` present but a specific method missing (e.g. Firefox lacking `readText`) →
    that method alone resolves `err("web", "unsupported")`; the other method still works.
  - A thrown `DOMException` named `"NotAllowedError"` — the one unambiguous web-side "denied" signal
    — maps to `err("web", "denied", message)`. Any other throw maps to `"error"`.

Both providers satisfy the same structural `ClipboardProvider` interface (`providers/types.ts`), so
island/consumer code calling `app.clipboard.*` behaves identically regardless of which shell it runs in.

Image and HTML clipboard operations are explicitly out of scope for v1 — they are not isomorphic even
*within* Tauri (unsupported on Android/iOS natively). Every exposed method genuinely works, or has a
documented typed absence, on both providers.

## API

Both methods are mounted at `app.clipboard` and return `Promise<SystemResult<...>>` — environmental
failures (unsupported, denied, unavailable, error) are typed data, never a thrown surprise.

```ts
const system = createApp({ plugins: [clipboardPlugin] });
await system.start();

const copy = await system.clipboard.writeText(shareUrl);
if (!copy.ok && copy.reason === "denied") {
  showManualCopyFallback(shareUrl);
}

const paste = await system.clipboard.readText();
if (paste.ok) {
  insertAtCursor(paste.value);
}
```

| Method | Signature | Notes |
|--------|-----------|-------|
| `readText`  | `() => Promise<SystemResult<string>>` | `err("denied")` when the user/browser refuses (`NotAllowedError`); `err("unsupported")` where read is unavailable (e.g. Firefox without user-gesture APIs, insecure context). |
| `writeText` | `(text: string) => Promise<SystemResult<void>>` | Writes plain text to the clipboard. |

## Configuration

None — no field has a cross-provider meaning. The plugin declares no `config` and is excluded from
`pluginConfigs`.

## Events

None — `clipboard` is pure request/response (`readText`/`writeText` via `app.clipboard.*`).

## Dependencies

None. `ctx.runtime` (provider selection) and `ctx.log` (error reporting) are core-plugin APIs,
always injected — never declared as a `depends` edge.
