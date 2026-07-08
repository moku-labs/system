# @moku-labs/system

Isomorphic system API for Moku — `store`, `notify`, `clipboard`, `tray`, and `deep-link` capabilities exposed through an env-style provider pattern. A **Tauri provider** is used when the native shell is detected; a **web provider** is the fallback otherwise. The same island code runs unchanged on web and native.

Built on **@moku-labs/core** (micro-kernel) and **@moku-labs/common** (shared family infrastructure: `logPlugin`, `envPlugin`, branded CLI kit).

## Package Manager

Use `bun` exclusively — never npm, yarn, or pnpm.

## Scripts

- `bun run build` — Build with tsdown
- `bun run lint` — Biome check + ESLint
- `bun run lint:fix` — Auto-fix lint issues
- `bun run format` — Format with Biome
- `bun run test` — Run all tests (vitest)
- `bun run test:unit` — Unit tests only
- `bun run test:integration` — Integration tests only
- `bun run test:coverage` — Tests with coverage

## Code Style

- **Formatter:** Biome (2-space indent, double quotes, semicolons, no trailing commas)
- **Linter:** ESLint 9 flat config + Biome (eslint-config-biome must be LAST)
- **TypeScript:** Strict mode with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`
- **Imports:** Use `import type` enforced via `@typescript-eslint/consistent-type-imports`
- **JSDoc:** Required on all source exports with descriptions, params, returns, and examples

## Architecture

Three-layer Moku model:

1. `src/config.ts` — `createCoreConfig<Config, Events, [...]>` (Layer 1: config + events; registers `logPlugin` + `envPlugin` as core plugins so `ctx.log` + `ctx.env` are on every `ctx`)
2. `src/index.ts` — `createCore` (Layer 2: framework + plugins); exports `createApp` / `createPlugin`
3. Consumer apps use `createApp` (Layer 3)

Plugins go in `src/plugins/`. Each capability is its own plugin.

### Domain: isomorphic system API + provider pattern

Each system capability — `store`, `notify`, `clipboard`, `tray`, `deep-link` — is a plugin that injects its API onto `ctx`, following the env-style provider pattern (the same way `envPlugin` injects `ctx.env`). At runtime each capability selects a provider:

- **Tauri provider** — chosen when the Tauri shell is detected (native).
- **Web provider** — the fallback when no native shell is present.

Consumer island code calls the same `ctx.*` API regardless of provider, so one codebase runs on web and native. Keep provider selection inside the plugin (detect once, expose a single stable surface); islands must never branch on the runtime themselves.

## Family conventions (@moku-labs/common)

Because this framework registers `logPlugin` + `envPlugin`, every plugin's `ctx` carries `ctx.log` and `ctx.env`. Enforced family-wide (MC1–MC3, checked by the `moku-common-validator`):

- **MC1** — Any CLI/DX surface renders through the branded kit (`@moku-labs/common/cli`: `createBrandConsole`, `box`, `spinnerFrameAt`, styled `confirm`/`select`) — never ad-hoc `console.log` UI.
- **MC2** — Use `ctx.log` for logging, never raw `console.*`.
- **MC3** — Use `ctx.env` for environment access, never raw `process.env`.

See the **moku-common** skill for the full rules and examples.

## Testing

- Vitest with unit + integration projects
- Framework-level tests: `tests/unit/` and `tests/integration/` (cross-plugin scenarios, `createApp` validation)
- Plugin-specific tests: `src/plugins/[name]/__tests__/unit/` and `__tests__/integration/` (colocated inside each plugin)
- 90% coverage threshold
- Never put plugin-specific tests in root `tests/` — root tests are for framework-level integration only

## Moku Development Toolkit

This project uses the **moku** Claude Code plugin for development workflows. Below are the available commands, skills, and agents.

### Commands (slash commands)

**Planning:**

- `/moku:brainstorm [create framework|app] "description"` — Explore architecture decisions before planning (Present → Challenge → Decide). Recommended for novel/complex domains like the provider-selection design here.
- `/moku:plan [create|update|add|migrate|resume] [type] [args]` — 3-stage gated workflow to plan a framework, consumer app, or plugin. Output goes to `.planning/specs/` (framework/plugin) or `.planning/app-spec.md` (app).

**Building:**

- `/moku:build [framework|app|plugin] [spec-or-name]` — Build from specifications. Auto-detects what to build, resumes if partially built. `/moku:build plugin #3` builds an individual plugin.

**Setup:**

- `/moku:init` — Initialize a new Moku project with full tooling (used to create this project).

### Skills (automatic context)

Skills load automatically when relevant; you can also reference them explicitly:

- **moku-core** — Architecture rules, factory chain, lifecycle, event system, context tiers. Use when working with `createCoreConfig`, `createCore`, `createApp`, or the three-layer model.
- **moku-plugin** — Plugin structure spec, complexity tiers (Nano → VeryComplex), file organization, wiring-harness pattern. Use when creating or reviewing the capability plugins.
- **moku-common** — `@moku-labs/common` usage: the branded CLI renderer, `logPlugin`/`ctx.log`, `envPlugin`/`ctx.env`. Directly relevant — this framework's provider pattern mirrors `envPlugin`.
- **moku-web** — Web patterns (Preact islands, CSS `@scope`/`@layer`, tokens). Use for any web-facing island that consumes this API.
- **moku-testing** — TDD protocol, mock context factories, integration scaffolds, type-level tests.

### Agents (validation)

Agents run autonomously to validate code; build commands call them automatically, but you can trigger them manually too:

- **moku-spec-validator** — Moku Core spec compliance: three-layer separation, factory chain, config, lifecycle, events.
- **moku-plugin-spec-validator** — Plugin structure: correct tier, file organization, JSDoc coverage, no anti-patterns.
- **moku-common-validator** — Family conventions MC1–MC3 (branded CLI, `ctx.log`, `ctx.env`).
- **moku-jsdoc-validator** — JSDoc completeness on all exports (description, `@param`, `@returns`, `@example`).
- **moku-type-validator** / **moku-test-validator** — Type correctness and test quality after a build.

### Typical Workflow

1. `/moku:brainstorm create framework "isomorphic system API with Tauri/web provider selection"` — optional, explore the provider-detection and API-shape decisions.
2. `/moku:plan create framework` — design the capability plugins (`store`, `notify`, `clipboard`, `tray`, `deep-link`) and the provider-selection structure (3 approval gates).
3. `/moku:build framework` — implement everything from specs; validators run automatically after each plugin.
4. `/moku:plan add plugin <name> "..."` + `/moku:build add <name>` — add a further capability plugin later.

## Specification

For questions about how things should be implemented, refer to the [Moku Core specification](https://github.com/moku-labs/core/tree/main/specification).
