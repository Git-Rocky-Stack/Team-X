# Dependency Upgrade Program

Major dependency upgrades are done one compatibility cohort at a time, not in one big change. Each cohort lands on its own pull request with the evidence listed below, so a regression points at one cohort.

This program answers findings P0-2 and P3-2 of the [2026-10-07 engineering audit](../CODEBASE_AUDIT_2026-10-07.md).

## The gate

`pnpm audit:deps` runs `pnpm audit` over the whole workspace graph, including dev and build tooling. Electron, electron-builder and the test runner build or ship the desktop binary, so they count toward release risk.

The gate fails on any critical or high advisory unless that advisory is listed in [`scripts/dependency-audit-exceptions.json`](../../scripts/dependency-audit-exceptions.json). Each listed exception needs a reason and an expiry date. The gate also fails when an exception has expired, or when an exception no longer matches any advisory. CI runs it on every pull request.

Overrides in the root `package.json` (`pnpm.overrides`) pin patched releases of transitive packages within their current major version. Each override names the vulnerable range it replaces. Remove an override once its parent package depends on a patched release.

## Done (v3.5.0)

| Cohort | From | To | Evidence |
| --- | --- | --- | --- |
| Production advisories | `pnpm audit --prod`: 1 critical, 33 high | 0 critical, 0 high, 4 low | Full test suite, typecheck, E2E |
| MCP SDK | 1.29 | 1.32 | MCP host tests |
| Drizzle ORM | 0.33 (kit 0.24) | 0.45 (kit 0.31) | All repository and migration tests |
| Electron | 31.7 (unsupported) | 44.7 (Node 24, Chromium 152) | Native rebuild (better-sqlite3 13, keytar), 26/26 E2E, AppImage boot |
| electron-builder | 26.8 | 26.15 | Linux AppImage packaged and booted |
| Vitest | 2.1 | 4.1 | 4,464 tests; config moved from `vitest.workspace.ts` to `test.projects` |
| Vite / electron-vite | 5.4 / 2.3 | 6.4 / 4.0 | Production build, E2E |
| chokidar | 3 | 4 | Folder-watcher tests; removes the main-process braces path |
| AI SDK UI bindings | Vue/Svelte/Solid installed with `ai@3` | Removed by override | The app never imports them |

Whole-graph `pnpm audit` went from 201 findings (6 critical, 90 high) to 1 high. That high is braces, a listed exception with no patched release (see Cohort 2).

## Remaining cohorts

Work them in this order. Each needs the evidence in its row before it merges. Every cohort also needs a green CI run on Windows, macOS and Linux.

| # | Cohort | Current → target | Why | Evidence required |
| --- | --- | --- | --- | --- |
| 1 | AI SDK | `ai` 3.4 → 7; `@ai-sdk/*` 0.0.x → 4; `ollama-ai-provider` 0.15 → 1; OpenRouter 0.0.6 → 3 | Clears the last 4 low advisories. Provider fixes only ship on current majors. | Provider-router adapter tests per provider. The Ollama adapter implements `LanguageModelV1` by hand and must move to the current model interface. Recorded live streaming smoke for Anthropic, OpenAI and Ollama. Tool-calling E2E. |
| 2 | Tailwind | 3.4 → 4 | Removes the braces build-time exception (expires 2027-01-31). | Port `tailwind.config` to CSS `@theme` without changing DESIGN.md tokens. The console sweep source-pin tests must stay green. Before/after screenshots of every surface in Night Ops and Day Shift. |
| 3 | TypeScript | 5.5 → 7 | Compiler speed; current lib types. | `pnpm typecheck` across all projects; `tsc --build` for composite references; ESLint typed rules. |
| 4 | Zod | 3 → 4 | Smaller bundle; current API. | Every IPC and trust-boundary schema test; role-pack validation; signed-pack verification. |
| 5 | Lint toolchain | Biome 1.9 → 2, ESLint 9 → 10 (plugins, `globals`, resolver) | Current rules; faster lint (see P3-1). | Clean lint on the full tree, with rule-diff notes for any rule renamed or retired. |
| 6 | Build and test | Vite 6 → 8, electron-vite 4 → 5, `@vitejs/plugin-react` 4 → 6, Vitest 4 → 5, jsdom 25 → 30, `@testing-library/jest-dom` 6 → 7 | Keep the build chain on supported lines. | Production build, bundle-budget check, full test suite, E2E. |
| 7 | Runtime small majors | `dotenv` 16 → 18, `nanoid` 5 → 6, `chokidar` 4 → 5 (needs Node ≥ 20.19), `@types/node` 20 → 24, `@types/better-sqlite3` 7 → 9 | Hygiene. | Unit tests for each touched module. |
| 8 | CR-SQLite | `@vlcn.io/crsqlite-wasm` 0.12 → 0.16 | Sync correctness fixes. | Sync and merge tests; backup and restore round trip. |

## Rules for every cohort

1. Branch from the latest `main`, and keep to one cohort per pull request.
2. Run `pnpm install --frozen-lockfile` from a clean checkout before you push. A stale lockfile broke `main` once (audit P0-1).
3. Run `pnpm audit:deps`, `pnpm lint`, `pnpm lint:eslint`, `pnpm typecheck`, `pnpm test`, and the Electron E2E suite under xvfb.
4. If a cohort touches Electron, electron-builder or native modules, also package one platform and boot it.
5. Record what changed and why in `CHANGELOG.md` under Unreleased.
