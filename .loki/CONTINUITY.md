# Loki Continuity — Phase 5, M29 COMPLETE

## Current State

- **Phase 4 (Ship-readiness) SHIPPED.** v1.0.0 tagged. All 27 milestones complete.
- **Phase 5 (Intelligence Layer) in flight.** Design doc at `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`.
- **M28 (Intelligence Package + RAG Foundation) COMPLETE** — 2026-04-13.
- **M29 (RAG integration into agent turns) COMPLETE** — 2026-04-13. All 10 tasks shipped. Commits 2d7e4bd → a marker commit.
- **Baseline at M29 close:** 665 unit tests (all green) + 5 E2E specs (4/5 passing — see Known Issues). Typecheck clean. Biome lint: 0 errors, 43 `noNonNullAssertion` warnings (+2 from 41 baseline, all M29 code).

## What shipped in M29

| Task | Commit | Deliverable | Tests |
|------|--------|-------------|-------|
| T1 | `2d7e4bd` | `embedText` + `EmbedAdapter` contract + Ollama/OpenAI embed adapters in provider-router | +4 |
| T2 | `c99893a` | Extended `ResolveSystemPrompt` with `threadId`; orchestrator call sites + test trace updated | 0 (type-only) |
| T3 | `4348b51` | `RagService` facade in @team-x/intelligence (`indexSource` + `retrieve` + `deleteBySource`) | +5 |
| T4 | `26180cd` | `RagIndexer` event-bus subscriber (work.completed + meeting.ended dispatch) | +5 |
| T5 | `941cb9f` | `composeSystemPromptWithRag` wrapper (dedup + token budget + `[Source: ...]` attribution) | +5 |
| T6 | `132eee4` + `246ab39` | Composition root wiring in main/index.ts; `buildEmbedAdapter` in provider-factory; shutdown-ordering fix | 0 (integration) |
| T7 | `8229021` + `9ca1ad0` | `rag.stats` / `rag.rebuildAll` / `rag.deleteForCompany` IPC; rebuild error isolation + strict-order test | +4 + 2 follow-ups = 6 |
| T8 pre | `c4b91a5` | `settings.getRagConfig` / `setRagConfig` consolidated IPC (backend) | 0 |
| T8 | `a2e23b6` | RAG Settings panel + `use-rag` hook + mount in SettingsView | 0 (renderer, no DOM test infra) |
| T9 | `30c1550` | `rag-flow.spec.ts` E2E; `__ECHO_SYSTEM__` + `__ECHO_TEXT__` sentinels; `makeFakeEmbedAdapter`; electron.vite bundles `@team-x/intelligence`; `0008_embeddings.sql` statement-breakpoint fix | +1 E2E |
| T10 | `e2883b4` (lint) + marker | Full verification + Biome autofix + CONTINUITY update + milestone marker | 0 |

**Net M29 delta:** 641 → 665 unit tests (+24). 4 → 5 E2E specs (rag-flow added).

## Known issues surfaced during M29 T10 verification (NOT caused by M29)

- **`vault-backup.spec.ts` regression.** Upload IPC succeeds (`[main] file uploaded: <id>`) but the renderer vault view does not surface the file within 10s. Same failure on isolated re-run. Not caused by any M29 change — M29 does not touch the vault repo, IPC, or renderer feature. Investigate in M30 as a pre-existing React Query invalidation issue around `vault.upload` / `vault.list` cache keys. Smoke, ticket-flow, meeting-flow, and rag-flow are all green.
- **Two ABI rebuilds needed for full CI loop.** `pnpm test` (Vitest under Node) and `pnpm -F @team-x/desktop test:e2e` (Electron) require opposite native-module ABIs for `better-sqlite3`. The dance:
  - For unit tests: `cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npx node-gyp rebuild --release`
  - For E2E: `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar`
  - CI should sequence the two rebuilds; the desktop package's postinstall currently handles only the Electron side.

## M30 (next milestone) — NLU Engine

**Plan doc:** TBD — not yet written. Blocked on: (a) intent schema lockdown (see Phase 5 design §5.1), (b) deciding LLM-based vs rule-based intent classifier for the first cut.

**Scope sketch (from Phase 5 design):**
- `intent-classifier.ts` — 15-intent schema (hire_employee, fire_employee, assign_ticket, create_ticket, close_ticket, promote_employee, create_project, create_goal, call_meeting, end_meeting, check_status, show_view, search_vault, complex_request, reopen_ticket)
- `entity-resolver.ts` — fuzzy name + FTS5 lookup
- `slot-filler.ts` — missing-param detection
- `command.*` IPC surface for the renderer command palette

## M29 Patterns to Carry Forward (learnings)

- **electron.vite.config.ts `workspaceDeps`.** Every new `@team-x/*` package that main/preload consumes MUST be added to the `externalizeDepsPlugin({ exclude: workspaceDeps })` list. Otherwise Vite leaves it external and Electron hits `ERR_UNKNOWN_FILE_EXTENSION` on the raw `.ts` source. Discovered the hard way in M29 T9 — took one user bug report (popup screenshot) to diagnose.
- **Drizzle multi-statement migrations.** drizzle-kit doesn't auto-insert `--> statement-breakpoint` between CREATE TABLE and CREATE INDEX — you must either write one statement per file or insert separators by hand. The M28 `0008_embeddings.sql` was missing these and worked only because nothing else had run migrations against a clean DB until M29 T9's E2E spec. Fixed at head of M29 T9.
- **Subagent-driven development pattern worked.** 10-task milestone, each task (mostly) dispatched to a fresh general-purpose implementer subagent with full task text + scene-setting context. Two-stage review (spec then quality) caught real issues: T4 code review spotted the listener isolation subtlety; T6 review caught the shutdown-ordering race (indexer must stop BEFORE orchestrator drain); T7 review flagged the lack of error isolation in rebuildSources. All addressed.
- **Two subagents ran out of context mid-task** (T8 renderer, T9 spec) — the fix was to let them write partial backend scaffolding, then have the coordinator finish the last piece inline. Don't re-dispatch for small completions.
- **Shared-types composite dist gotcha.** Any new export in `packages/shared-types/src/*.ts` must be followed by `pnpm -F @team-x/shared-types exec tsc --build --force` or downstream `@team-x/intelligence` / `@team-x/desktop` composite typechecks will fail with `TS2305: has no exported member`. Known from M28; re-confirmed twice in M29.
- **Biome autofix on M29 artifacts.** 11 errors autofixed in T10 (all import-order + `import type` consolidation). Final baseline: 0 errors, 43 `noNonNullAssertion` warnings (+2 from 41 baseline). The +2 are in M29 test fixture code; acceptable.

## Architectural Seams Added in M29 (for quick lookup)

- **`EmbedAdapter` contract** in `@team-x/provider-router` — minimal `{model, dimension, embed(texts)}` interface. Mirrors `ProviderStreamFn` layering: pure factory (`createEmbedText`) enforces dimension + count invariants, adapter files (`ollama-embed.ts`, `openai-embed.ts`) own the HTTP.
- **`RagService` facade** in `@team-x/intelligence` — two surface methods: `indexSource` + `retrieve`. Delete-then-insert on re-index so shorter content doesn't leave stale chunks. Float32Array ↔ Buffer serialization lives here, not in call sites.
- **`RagIndexer`** in `apps/desktop/src/main/services/` — one event-bus subscriber, dispatch table routes `work.completed` → embed message, `meeting.ended` → embed minutes. Fire-and-forget async (void IIFE) with catch-and-log — never breaks event fan-out (see `event-bus.ts` listener-isolation contract).
- **`composeSystemPromptWithRag`** in `apps/desktop/src/main/services/system-prompt.ts` — pure wrapper around the role.md render step. Dedups against recent thread history, enforces token budget, emits `[Source: label id]` attribution. Zero-regression guarantee when RAG disabled.
- **Test-mode hooks for RAG E2E:**
  - `__ECHO_SYSTEM__` → test-mode provider replies with the system prompt verbatim (asserts on retrieval).
  - `__ECHO_TEXT__:<payload>` → test-mode provider replies with `<payload>` verbatim (seeds a distinctive marker into the embeddings index).
  - `TEAM_X_RAG_TEST=1` env var → `buildRagService()` wires the deterministic `makeFakeEmbedAdapter` instead of falling through to null in test mode.

## Next Session Startup Checklist

1. Read this CONTINUITY file.
2. Read `.loki/state/orchestrator.json` → currentMilestone should be `M30`, tasksCompleted 0.
3. Open `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md` §5 for M30 (NLU Engine) design context.
4. Write M30 plan doc at `docs/plans/2026-04-13-team-x-phase-5-m30-nlu-engine.md` (same structure as M29 plan doc).
5. Rebuild `.loki/queue/pending.json` with M30 tasks.
6. Investigate `vault-backup.spec.ts` regression as a bonus task or fold into the M30 set.

## Environment

- OS: Windows 11 Pro
- Shell: bash (Unix syntax — `/dev/null`, forward slashes)
- Repo root: `C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X`
- Node: 20 LTS (ABI 125 for Electron, ABI 137 for local v22 — see Known Issues for the rebuild dance)
- Package manager: pnpm workspaces
- Test runner: Vitest (unit) + Playwright (E2E)
