# Loki Continuity — Phase 5, M31 IN PROGRESS (T0 + T1 + T2 shipped)

## Current State

- **Phase 4 (Ship-readiness) SHIPPED.** v1.0.0 tagged. All 27 milestones complete.
- **Phase 5 (Intelligence Layer) in flight.** Design doc at `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`.
- **M28 (Intelligence Package + RAG Foundation) COMPLETE** — 2026-04-13.
- **M29 (RAG integration into agent turns) COMPLETE** — 2026-04-13.
- **M30 (NLU Engine + Command Palette) COMPLETE** — 2026-04-14. 11 tasks (T0–T10).
- **M31 (Agentic Loop) IN PROGRESS** — plan doc at `docs/plans/2026-04-14-team-x-phase-5-m31-agentic-loop.md`.
  - **T0 SHIPPED** (commit `4f30efa`) — system-agent pseudo-employee, migration 0010 (`is_system` column + partial index), `system-agent.md` role card under `role-packs/strategia-official/roles/system/`, `system-agent-bootstrap.ts` with `ensureSystemAgent` + bus event, `employees.list` + `orgchart.get` + delegation pickers all filter `is_system = 0`. +89 employees.test rows + 151 bootstrap.test + 72 ipc/handlers tests.
  - **T1 SHIPPED** (commit `67e0136`) — `@team-x/intelligence/src/loop/` (types, prompt, tool-registry, loop). Pure ReAct orchestrator, provider-agnostic, zero Electron/DB/fs coupling. Forward-scan brace-balanced parser, one-shot nudge recovery, hard step/token/wall-clock budgets. 33 new unit tests (loop 19, tool-registry 8, prompt 6).
  - **T2 SHIPPED** (commit pending) — `apps/desktop/src/main/services/agentic-tools.ts` — six read-only tools (`query_employees`, `query_tickets`, `query_projects`, `query_meetings`, `query_vault`, `query_events`) wrapping existing repos with JSON-safe projections, `{rows, truncated}` envelope capped at 50 rows, defensive `isSystem` filter on employees path, `summarizePayload` with 200-char cap + ellipsis. 40 new unit tests (+20 target). Also: added `zod` to `apps/desktop` deps, cleared T1's `Record<string, any>` default in `Tool` generic (→ `unknown`), rebuilt `packages/intelligence/dist` to surface loop types to composite consumers.
- **Current metrics:** 909 unit tests (+90 over baseline, +40 over T1), 0 lint errors, 24 lint warnings (well under ≤76 target), typecheck clean, 7 E2E specs (untouched). 8 pre-existing ABI failures on `embeddings.test.ts` + `vec-init.test.ts` — same Node-v22/Electron-125 skew documented in §Troubleshooting; resolved by T10 rebuild dance.
- **Baseline at M31 start:** 819 unit tests + 7 E2E specs. Typecheck clean. Biome: 0 errors, 66 warnings.
- **M31 targets:** ~905 unit tests (+86), 8 E2E specs (+1), 0 lint errors, ≤76 warnings.

## M31 scope in one paragraph

M31 replaces the M30 T4 `complex_request` stub (`command-service.ts:770-775`) with a real ReAct-style agentic loop running on a hidden `system-agent` pseudo-employee. Scope is **READ-ONLY**: six data-gathering tools (`query_employees`, `query_tickets`, `query_projects`, `query_meetings`, `query_vault`, `query_events`) wrap existing repos with JSON-safe projections. The loop plans, calls tools, observes, iterates, and produces a grounded answer — all under hard step/token/timeout budgets. Every complex_request creates a new persisted thread on the system-agent; the palette streams `agent.step` events live, then hands off to thread view for history. Write-side Task Planner tools (decompose/delegate/review from §7 of the Phase 5 design) are explicitly deferred to M32 — any PR attempting to land them in M31 must be rejected.

## M31 task queue (11 tasks)

| Task | Status | Est tests | Key deliverable |
|------|--------|-----------|-----------------|
| T0 | shipped | 8 (actual 89+151+72) | `is_system` migration 0010 + `system-agent.md` role card + `ensureSystemAgent(companyId)` bootstrap |
| T1 | shipped | 18 (actual 33) | `@team-x/intelligence/src/loop/` — pure ReAct loop, tool registry, budget enforcement |
| T2 | shipped | 20 (actual 40) | `agentic-tools.ts` — 6 read-only tools wrapping employees/tickets/projects/meetings/vault/events repos |
| T3 | pending | 12 | `AgenticLoopService` — start/stop/getRun, event bus integration, orchestrator pause respect |
| T4 | pending | 6 | CommandService → AgenticLoopService wiring. Replaces T4 stub. `CommandHandlers.agenticLoopStart` |
| T5 | pending | 6 | System-agent thread UX — Copilot Conversations section, inline step transcript |
| T6 | pending | 0 (E2E) | Palette step-log mode + `command.stop` IPC + six UI states |
| T7 | pending | 8 | Settings: `agentic_max_steps` (8), `agentic_max_tokens` (8000), `agentic_timeout_ms` (120000) |
| T8 | pending | 1 (E2E) | `agentic-loop.spec.ts` — full round-trip via `test-agentic-provider.ts` seam |
| T9 | pending | 0 | Docs — CLAUDE.md, CHANGELOG, README, `docs/user-guide/agentic-loop.md`, design-doc §9 resequence |
| T10 | pending | 0 | Verification + milestone marker — typecheck, lint, tests, E2E, ABI rebuild dance, state update |

**Task dependencies:** T1 blocks on T0. T2 blocks on T1. T3 blocks on T1+T2. T4/T5/T7 block on T3. T6 blocks on T4+T5. T8 blocks on T6+T7. T9 blocks on T8. T10 blocks on T9.

## M30 shipped commits (carried forward from last session)

| Task | Commit | Deliverable |
|------|--------|-------------|
| T0 | `f4ac227` | Vault event-bus wiring — unblocks vault-backup.spec.ts |
| T1 | `84b5bc7` | Intent classifier — 15 intents, LLM JSON output, Zod validation, 0.5 confidence threshold |
| T2 | `6d99aa4` | Entity resolver — fuzzy Levenshtein + FTS5 tri-state |
| T3 | `73968c8` | Slot filler — required-slots table, SLOT_KEY_ALIASES, destructive confirmation gate |
| T4 | `8285834` | CommandService — 20-case dispatch + FIFO history + bus emit |
| T5 | `709bae5` | `command.*` IPC — 4 channels + `Expect<Equal<IntentName, IpcIntentName>>` drift guard |
| T6 | `15ba829` | Command palette UI — Cmd+K, debounced parse, confidence bar, destructive confirm dialog, history picker |
| T7 | `2a3ec7b` | Dashboard Commands subtab + audit row summary |
| T8 | `569d960` | E2E `command-palette.spec.ts` + `createTestClassifier` seam + `employees.fire` IPC |
| T9 | `cbf8f5b` | Docs — README + user guide + CHANGELOG + CLAUDE updates |
| T10 | (M30 close commit) | Orchestrator → M31, pending cleared, CONTINUITY rewritten |

## M30 patterns to carry forward (still active)

- **Subagent context exhaustion on E2E tasks.** T8 M30 required three handoffs. Pattern: scaffold + spec authoring goes to subagent; verification + commit stays with coordinator. M31 T8 will hit the same wall — budget for it.
- **`Expect<Equal<A, B>>` compile-time drift guards are worth their weight.** M30 T5 pattern keeps `IntentName` (intelligence) and `IpcIntentName` (shared-types) in lock-step. M31 must preserve this guard when extending `ExecuteResult` in T4.
- **Canned seam pattern for E2E.** M30 `createTestClassifier()` at `NODE_ENV=test`. M31 needs `test-agentic-provider.ts` + `test-agentic-tools.ts` mirrors. Scripted plan → tool_call → answer.
- **`SLOT_KEY_ALIASES` is an architectural seam.** Not directly relevant to M31 (complex_request has no required slots) but the principle applies: new tools should not invent parallel key spaces — extend existing ones.
- **ABI rebuild dance is mandatory.** `pnpm test` (Node ABI) and `pnpm -F @team-x/desktop test:e2e` (Electron ABI) cannot run back-to-back without rebuild in between. T10 verification runs both — rebuild dance must execute.
- **Invariant #11: IPC mutations must emit bus events.** Every M31 IPC channel that changes state (`agenticLoopStart`, `command.stop`) emits a bus event so the renderer invalidates via subscription, not just the IPC return.
- **Dashboard subtab pattern is sturdy.** If M31 needs a step-log or agent-timeline subtab later, the M14 pattern is ~5 touchpoints.
- **Inline primitives over new deps.** If palette step cards need a collapsible, hand-roll it in-feature, don't add a collapse lib. Follow M30 T6's `<output aria-live>` choice.

## Architectural seams from M30 (still in place)

- `@team-x/intelligence/src/nlu/` — three pure-factory modules. M31 adds a sibling `loop/` subtree.
- `apps/desktop/src/main/services/command-service.ts` — main-process front-door with `d.handlers.agenticLoopStart` TODO marker. M31 T4 fills it.
- `apps/desktop/src/main/services/test-classifier.ts` — NODE_ENV=test seam. M31 mirrors with `test-agentic-provider.ts`.
- `apps/desktop/src/main/db/repos/command-history.ts` + `0009_command_history.sql`. M31 adds `0010_employee_is_system.sql` on top.
- `apps/desktop/src/renderer/src/features/command/` — palette + `intent-labels.ts`. M31 adds `step-card.tsx` + palette step-log mode.

## Known issues (post-M30, open for M31)

- **ABI rebuild dance still manual.** Documented in CLAUDE.md §Troubleshooting. Not blocking M31.
- **Renderer DOM test harness still missing.** M31 T5 + T6 will also have no component tests; E2E (T8) covers the round-trip. Same posture as M30.
- **`suggest` is a static list.** M30 left a placeholder. Not blocking M31; could be revisited in a later milestone.
- **`complex_request` stub is the M31 entry point.** T4 explicitly replaces the stub at `command-service.ts:770-775`. Leave the exhaustiveness-guard switch case — swap the body.
- **Undo toast scoped to palette.** Low-priority shared-primitive follow-up.

## Next Session Startup Checklist (M31 mid-flight — begin T3)

1. Read this CONTINUITY file.
2. Read `.loki/state/orchestrator.json` → tasksCompleted should be 3 (T0 + T1 + T2), inflight.M31.commits includes T2 sha.
3. Read `docs/plans/2026-04-14-team-x-phase-5-m31-agentic-loop.md` — full plan doc, focus on T3 section.
4. Pick `T3` from `.loki/queue/pending.json` (`AgenticLoopService` main-process front-door). Set status `in_progress`. Lives in `apps/desktop/src/main/services/agentic-loop-service.ts`. Methods: `start({companyId, userText})` → `{runId, threadId}`, `stop(runId)`, `getRun(runId)`. Respects `orchestrator.isCompanyPaused()`.
5. T3 consumes T2's `createAgenticTools({companyId, employeesRepo, ticketsRepo, projectsRepo, meetingsRepo, vaultRepo, auditRepo})` and pipes through `createToolRegistry` from `@team-x/intelligence`. Provider hook: wrap `streamAgent` from provider-router as a `LoopCompleteFn` (collect deltas, return full completion + usage).
6. T3 must also add a `NODE_ENV=test` seam — `test-agentic-provider.ts` mirroring M30 T8's `test-classifier.ts`. Scripted plan → tool_call → answer fixtures.
7. Commit atomically after each task. Update pending.json status + orchestrator `tasksCompleted` + inflight commit hash on each completion.
8. After T10, move M31 from `inflight` into `history`, clear pending.json, rewrite CONTINUITY with an M31-COMPLETE header.

## T2 patterns to carry forward (new)

- **Composite-project `dist/` is load-bearing.** `@team-x/intelligence` uses `composite: true` with `outDir: ./dist`. Consumers reach its types via project references, not `src/`, so dist/ must be rebuilt after every types.ts change or downstream packages see stale exports. Command: `pnpm -F @team-x/intelligence exec tsc` (without `--noEmit`). `pnpm typecheck` does NOT rebuild because every package's typecheck script ends in `--noEmit`. Future T1-style changes to intelligence must include a dist/ rebuild step.
- **`{rows, truncated}` envelope is the agentic tool contract.** Drop `total`. Truncation is a single boolean; the LLM can tighten its filters and re-query if it needs more. Propagate this shape to T8's test-agentic-tools fixtures and any future agentic tools (M32 write-side tools MUST use the same envelope).
- **`as unknown as Deps['fooRepo']` is the preferred test-stub cast.** Avoids `noExplicitAny` warnings while keeping mock shape minimal. Biome's line-scoped `biome-ignore` directive does NOT propagate into object-literal field values when they span multiple lines — hence the cleaner `unknown`-via-alias pattern. Reuse for all agentic service tests.
- **`zod` is now in `apps/desktop` deps.** T2 added it explicitly (pinned `^3.23.0` to match intelligence). Any future main-process service that builds zod schemas can import from the local package without adding a dep. Kept in sync with the intelligence dep so runtime lib version matches.
- **biome's formatter runs under `pnpm lint` (via `biome check`).** A formatter diff surfaces as a single `error` line regardless of `linter.rules`. If an unfamiliar error count appears after an edit, run `pnpm format` before triaging — the error is often trailing-comma/quote-style, not a real lint regression.

## T1 patterns to carry forward (still active)

- **JSON-only ReAct contract.** Assistant ends every turn with `{"action": ...}`. Forward-scan tracks brace depth (string-aware) to find the LAST top-level `{...}`; everything before it is `thought` (plan step). Don't change the prompt wording in `prompt.ts` without updating the parser — the contract is load-bearing.
- **Typed tool-invocation result, never throws.** `ToolRegistry.invoke()` returns `{kind: 'ok' | 'unknown_tool' | 'invalid_args' | 'timeout' | 'threw'}`. The loop is a clean switch on these — no try/catch noise. Mirror this discipline in T2's tools: throw freely; the registry contains it.
- **Nudge-once-then-fail.** Malformed action JSON or invalid args → one nudge prompt → second failure terminates with `tool_call_invalid`. Same discipline as M30 T1's intent classifier.
- **Per-tool AbortController layered on outer signal.** Pre-aborted outer signal short-circuits before `execute` runs. `tool_timeout` is `localController aborted && !outer aborted`. Reuse this pattern in T3 when wrapping the loop's outer cancel.
- **Telemetry on every step.** `{tokensIn, tokensOut, costUsd, provider, model}` — `ZERO_TELEMETRY` constant for tool_result/error steps. T3's `runs` row aggregates these; T17 telemetry dashboard reads them.
- **biome --unsafe is OK for test-file `!` → `?.`.** Cleared 40 warnings in one shot. Watch out: in non-test code (entity-resolver.ts) the auto-fix lost a precondition — replace with explicit guard. Future biome cleanup runs should run typecheck immediately after.

## Environment

- OS: Windows 11 Pro
- Shell: bash (Unix syntax — `/dev/null`, forward slashes)
- Repo root: `C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X`
- Node: 20 LTS (ABI 125 for Electron, ABI 137 for local v22 — rebuild dance required between `pnpm test` and `pnpm -F @team-x/desktop test:e2e`)
- Package manager: pnpm workspaces
- Test runner: Vitest (unit) + Playwright (E2E — 7 specs, target 8 at M31 close)
