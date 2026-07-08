# runtime

> Core plugin (Micro tier) — synchronous shell/platform detection (`ctx.runtime.kind` / `ctx.runtime.platform`).

**Directory exception (D-008, user-approved):** this directory also hosts the framework's shared seam
modules — `result.ts` (public `SystemResult<T>` contract, re-exported via `src/index.ts`) and
`provider.ts` (internal resolution-lifecycle helper + per-app teardown registry keyed by the frozen
`ctx.global`, D-009). Sibling capability plugins import them via `../runtime/*`. These are pure,
stateless helper modules — not cross-plugin state access.

## Configuration

<!-- Populated during build -->

## API

<!-- Populated during build -->
