# Loki Continuity — Phase 5, M31 PLANNED + QUEUED

## Current State

- **Phase 4 (Ship-readiness) SHIPPED.** v1.0.0 tagged. All 27 milestones complete.
- **Phase 5 (Intelligence Layer) in flight.** Design doc at `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`.
- **M28 (Intelligence Package + RAG Foundation) COMPLETE** — 2026-04-13.
- **M29 (RAG integration into agent turns) COMPLETE** — 2026-04-13.
- **M30 (NLU Engine + Command Palette) COMPLETE** — 2026-04-14. 11 tasks (T0–T10).
- **M31 (Agentic Loop) PLANNED + QUEUED** — plan doc at `docs/plans/2026-04-14-team-x-phase-5-m31-agentic-loop.md`. 11 tasks queued in `.loki/queue/pending.json`. Orchestrator advanced. Ready to begin T0.
- **Baseline at M31 start:** 819 unit tests + 7 E2E specs. Typecheck clean. Biome: 0 errors, 66 warnings.
- **M31 targets:** ~905 unit tests (+86), 8 E2E specs (+1), 0 lint errors, ≤76 warnings.

## M31 scope in one paragraph

M31 replaces the M30 T4 `complex_request` stub (`command-service.ts:770-775`) with a real ReAct-style agentic loop running on a hidden `system-agent` pseudo-employee. Scope is **READ-ONLY**: six data-gathering tools (`query_employees`, `query_tickets`, `query_projects`, `query_meetings`, `query_vault`, `query_events`) wrap existing repos with JSON-safe projections. The loop plans, calls tools, observes, iterates, and produces a grounded answer — all under hard step/token/timeout budgets. Every complex_request creates a new persisted thread on the system-agent; the palette streams `agent.step` events live, then hands off to thread view for history. Write-side Task Planner tools (decompose/delegate/review from §7 of the Phase 5 design) are explicitly deferred to M32 — any PR attempting to land them in M31 must be rejected.

## M31 task queue (11 tasks)

| Task | Status | Est tests | Key deliverable |
|------|--------|-----------|-----------------|
| T0 | pending | 8 | `is_system` migration 0010 + `system-agent.md` role card + `ensureSystemAgent(companyId)` bootstrap |
| T1 | pending | 18 | `@team-x/intelligence/src/loop/` — pure ReAct loop, tool registry, budget enforcement |
| T2 | pending | 20 | `agentic-tools.ts` — 6 read-only tools wrapping employees/tickets/projects/meetings/vault/events repos |
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

## Next Session Startup Checklist (M31 kickoff — begin T0)

1. Read this CONTINUITY file.
2. Read `.loki/state/orchestrator.json` → currentMilestone should be `M31`, totalTasks = 11, tasksCompleted = 0, planDoc set.
3. Read `docs/plans/2026-04-14-team-x-phase-5-m31-agentic-loop.md` — full plan doc.
4. Pick `T0` from `.loki/queue/pending.json`, set its status to `in_progress`, execute.
5. Commit atomically after each task. Update pending.json status + orchestrator `tasksCompleted` on each completion.
6. After T10, clear pending.json and rewrite CONTINUITY with an M31-COMPLETE header.

## Environment

- OS: Windows 11 Pro
- Shell: bash (Unix syntax — `/dev/null`, forward slashes)
- Repo root: `C:\Users\User\Desktop\Development Projects\Strategia-Enhanced-App\Team-X`
- Node: 20 LTS (ABI 125 for Electron, ABI 137 for local v22 — rebuild dance required between `pnpm test` and `pnpm -F @team-x/desktop test:e2e`)
- Package manager: pnpm workspaces
- Test runner: Vitest (unit) + Playwright (E2E — 7 specs, target 8 at M31 close)
