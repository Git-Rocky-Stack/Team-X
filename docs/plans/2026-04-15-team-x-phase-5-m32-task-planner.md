# M32: Task Planner (write-side) — Implementation Plan

**Milestone:** M32 — Task Planner (decompose / delegate / review).
**Phase:** 5 — Intelligence Layer.
**Depends on:** M29 (RAG), **M31** (agentic-loop harness).
**Blocks:** M33 (Copilot Service reuses the same harness for ask-the-copilot free-form questions).
**Design reference:** [`2026-04-13-team-x-phase-5-intelligence-layer.md`](./2026-04-13-team-x-phase-5-intelligence-layer.md) §4 + §7 + §9 + §11 + §13 (D6, D7, D8, D10) + §14.
**Previous milestone plan:** [`2026-04-14-team-x-phase-5-m31-agentic-loop.md`](./2026-04-14-team-x-phase-5-m31-agentic-loop.md) (structural template — mirror it).
**Status at plan-doc time:** T0 + T1 **shipped** (M31 follow-ups F1 + F2 closed as pre-work). T2 – T10 pending.

## Overview

M31 shipped the agentic loop as a **read-only** surface: a system-agent pseudo-employee runs a ReAct loop over six `query_*` tools, answers complex-request prompts, streams step cards to the palette, and persists a Copilot thread — but it cannot mutate any company state. M32 closes that gap by swapping (per-employee-level) a **write-side tool registry** into the same `AgenticLoopService` harness — enabling manager-level agents to decompose projects into ticket trees, delegate subtasks to ICs with deterministic workload-scored assignments, and review completed deliverables.

**The harness does not change.** M31's ReAct scheduler, pause-aware `providerRouter.complete` wrapper, AbortController-based stop, three-tier test seam (classifier + provider + tools), `data-step-kind` palette selector surface, `runs` telemetry row of kind `agentic`, and `agent.step` / `agentic.completed` / `agentic.failed` bus events all carry forward unchanged. The delta is **new tools + new bus event types + new step kinds + new settings + level-based injection + confirmation gates for destructive writes**.

**T0 + T1 prework (already shipped):** Before the write-side loop lights up, two renderer-only race conditions from M31 T8 needed to close so users reliably see live `ticket_created` / `delegation_made` / `review_pending` cards. F1 (`useAgentStepStream` snapshot backfill on mount, commit `f515ea7`) and F2 (`useThreadList` bus invalidator, commit `62a0504`) landed as M32 T0 and T1 respectively. See CONTINUITY §M32 T0+T1 for fix shapes.

### What ships (T2 – T10)

- **Write-side agentic tools** — `decompose_project`, `delegate_subtask`, `review_deliverable`. Each is a main-process closure over existing repos (tickets, projects, employees, runs), NOT an MCP server (invariant #3 + design decision D10). Each emits its own bus event(s) on success and writes an audit row. Envelope shape follows M31's `{rows, truncated}` pattern, extended with `{created, failed}` for confirmation artifacts.
- **Level-based tool injection** — `buildToolsForEmployee(employee, companyId)` returns the union of read-side tools (always) plus write-side tools gated on the employee's level per §7.1: `decompose_project` for Officer / Senior Mgmt / Management, `delegate_subtask` + `review_deliverable` for Management / Supervisor / Lead. System-agent gets all tools for the Copilot Conversations surface (M33).
- **Deterministic workload scoring function** — `scoreEmployee(employee, subtask)` in `agentic-tools-write.ts` per §7.4, **no LLM call**. Weights w1=0.4 (role_fit), w2=0.3 (1 - load_ratio), w3=0.2 (availability), w4=0.1 (past_performance). Pure, unit-testable, deterministic — D7 locked.
- **New bus event types** — `plan.proposed`, `plan.approved`, `task.delegated`, `task.escalated`, `review.requested`, `review.completed` (§7.5). Appended to `EventType` union in `packages/shared-types/src/events.ts`. All payloads JSON-safe, discriminator field `type`.
- **New step kinds** — `ticket_created`, `delegation_made`, `review_pending`. Extend `AgentStepKind` in `events.ts` AND the `projectStepBody` switch in `agentic-loop-service.ts` AND the `AgentStepPayload` narrow helpers AND the palette's `step-card.tsx` variants **in lockstep** — per M31 T0 "wire-shape invariant" captured in CONTINUITY.
- **Palette confirmation gates for destructive writes** — `delegate_subtask` (creates a ticket with assignment) and `review_deliverable { action: 'reject' }` require `confirmed: true` in `command.execute` before the tool fires, mirroring M30's destructive-intent gate on fire/close/end-meeting/promote. Rendered as an inline `confirm-gate` card between the `plan` step and the first write-side step.
- **Guardrails at the tool level, not the prompt level** — `planner_max_tickets` (default 10), `planner_max_depth` (default 2), `planner_approval_level` (default `'management'`), `planner_escalation_threshold` (default 3). Enforced inside the tool function bodies with clear error strings the loop can surface as `tool_result` error envelopes. D6 locked.
- **Level-aware tool exposure** — the tool registry builder reads `employee.level` from the role-pack frontmatter and injects the matching subset. ICs cannot delegate; only Management+ can review. Enforced at registry construction, not runtime.
- **AuditView event-type filter chips** — all six new event types rendered as chips in the Audit tab's filter surface with matching icons (following M31's audit-log posture).
- **Settings — planner subsection in Settings → Runtime** — four clamped keys exposed via a new `settings.getPlanner` / `settings.setPlanner` IPC pair, rendered as a new "Task Planner" subsection under the existing "Agentic Loop" subsection.
- **E2E spec** — `task-planner.spec.ts`. Canned classifier returns `complex_request`. Canned provider streams `plan → tool_call(decompose_project) → tool_result → tool_call(delegate_subtask) → confirm_gate → tool_result → answer`. Verify palette step log (`data-step-kind="ticket_created"` and `data-step-kind="delegation_made"`), persisted thread, `plan.proposed` + `task.delegated` audit rows, and actual tickets created in the DB. Extends the three-tier test seam with write-side canned entries.
- **Documentation** — CLAUDE.md status block + Phase 5 M32 entry + write-side tool troubleshooting; CHANGELOG [Unreleased] M32 entry; README Intelligence Layer section gets the planner blurb; new `docs/user-guide/task-planner.md` following the F10 user-guide shape (Overview → Mechanics → Tools → Settings → Control → Privacy → Example → Troubleshooting); Phase 5 design doc §14 follow-ups closed (F1 + F2 struck through with commit refs).

### Invariants preserved

1. **Renderer is a pure view.** Palette calls `command.execute` + subscribes to `agent.step` events. The new `ticket_created` / `delegation_made` / `review_pending` cards are rendered from bus events, not from direct DB reads. No LLM, no tool execution, no DB in the renderer.
2. **Orchestrator is the only scheduler.** `AgenticLoopService` continues to poll `orchestrator.isCompanyPaused(companyId)` in the `providerRouter.complete` wrapper. Write-side runs fired during a meeting queue and resume with the orchestrator. No independent dispatch, no slot bypass.
3. **MCP Host stays a singleton.** Write-side tools are main-process closures over existing repos (tickets, projects, employees, runs), NOT MCP servers. D10 locked.
4. **Provider router is the only LLM touch-point.** The loop calls `providerRouter.complete(...)` exclusively for the scheduler turns; workload scoring is deterministic and does not call any provider. Privacy tier + concurrency caps + cost tracking flow unchanged.
5. **Storage is SQLite + filesystem vault.** New tickets go through the existing `tickets` repo. Project links go through the existing `project_tickets` linking table. No new storage layer. `runs` telemetry continues to record kind `agentic` for loop runs.
6. **Events table is append-only.** Six new event types appended, payloads JSON-safe, discriminator field `type`. AuditView consumes them read-only.
7. **Zero phone-home.** No new network surface. No new telemetry. No new metrics endpoints.
8. **Secrets in OS keychain.** No new secret storage.
9. **Role-pack overrides preserved.** `system-agent.md` frontmatter governs tool visibility for the Copilot surface. Role-md customization rules (frontmatter overrides, body prompt additions) continue to apply — including `tools_allowed` / `tools_denied` enforcement for human-level role packs that opt into write-side tools in the future.
10. **Runtime strategy adaptive.** Loop respects runtime slot counts (Hybrid / Always-On / Lean) at dispatch. Write-side loops count against the same slot pool as read-side.
11. **IPC mutations emit bus events.** `decompose_project` emits `plan.proposed`. `delegate_subtask` emits `task.delegated`. `review_deliverable` emits `review.completed` and (on rejection with escalation) optionally `task.escalated`. Renderer caches (`useThreadList`, ticket kanban, project detail) invalidate on these events per M32 T1's invalidator pattern.

### Success criteria

- `"decompose the Q2 launch project"` typed into `Cmd+K` by Rocky (as CEO employee, or as user) produces: a proposed plan (3–5 subtasks), confirmation gate, delegated tickets in the `tickets` table with correct assignees (per workload scoring), persisted Copilot thread with step-log transcript, and corresponding audit rows for `plan.proposed` + `task.delegated`.
- Workload scoring is fully deterministic and round-trips the same `(employee, subtask)` pair to the same score byte-for-byte across runs — no LLM variance. `score-employee.test.ts` asserts this with 10+ cases.
- Every guardrail is enforceable and tested: max tickets (11 requested → 10 created + 1 rejected with error), max depth (subtask of subtask of subtask → rejected), approval level (IC employee attempts `decompose_project` → rejected at registry construction), escalation threshold (3 consecutive failures → `task.escalated` fires with manager as target).
- Confirmation gate fires exactly once per destructive tool call. Rejecting the gate coerces the loop into an early `canceled` terminal state with no ticket created.
- `task-planner.spec.ts` green. All 9 prior E2E specs green. `pnpm -r typecheck` clean across all six packages. Biome lint: 0 errors, ≤ 34 warnings (maintains M32 T0+T1 baseline of 24, with a +10 budget for step-card variant additions).
- Unit test baseline: 964 → ~995 (+~30 — aligns with design §9 estimate for M32). E2E: 8 specs → 9 specs.
- `NODE_ENV=test` seam extended: canned `test-agentic-tools-write.ts` emits scripted `decompose_project` / `delegate_subtask` / `review_deliverable` results; canned provider table seeded with matching per-prompt scripted tool-call sequences. No Ollama, no network — same posture as M31.

## Task breakdown

> **T0 + T1 already shipped** — M31 follow-ups F1 (backfill) + F2 (invalidator). See CONTINUITY §M32 T0+T1 for full fix shapes. Task IDs below start at T2.

### T2: Write-side agentic tools — `apps/desktop/src/main/services/agentic-tools-write.ts`

**Scope:** New file. Three tool factories plus the deterministic workload scorer.

**Deliverables:**
- `scoreEmployee(employee, subtask, ctx): number` — pure function. Reads `employee.role_fit` (parsed from role.md `capabilities` frontmatter), `ctx.openTicketCount(employeeId)` for load ratio, `ctx.inMeeting(employeeId)` for availability, `ctx.avgCompletionMs(employeeId, subtask.type)` for past performance. Weights from Phase 5 §7.4 locked as module constants. Returns `[0,1]`.
- `buildDecomposeProjectTool(deps): Tool<'decompose_project'>` — validates `brief` + optional `goalId` / `projectId`; queries org chart, RAG context, ticket workload; calls the provider via `deps.providerRouter.complete()` for the subtask-list generation (this ONE LLM call stays inside the tool — scheduler separate); scores candidates with `scoreEmployee`; returns `{ planId, subtasks: [{title, assigneeId, complexity, dependsOn?}], truncated }`. Emits `plan.proposed`. Respects `planner_max_tickets` + `planner_max_depth`.
- `buildDelegateSubtaskTool(deps): Tool<'delegate_subtask'>` — validates plan-id provenance, creates ticket via `tickets.create({ assigneeId, parentProjectId, ... })`, enqueues agent work via orchestrator, returns `{ ticketId, assigneeId, status: 'created' }`. Emits `task.delegated`. On assignment conflict (employee fired / in meeting / at cap), falls back to next-highest-scored employee, increments failure counter, escalates on threshold.
- `buildReviewDeliverableTool(deps): Tool<'review_deliverable'>` — validates ticket is `status: 'done'`, reads latest message(s) as the deliverable, calls provider for review, emits `review.requested` at start and `review.completed` at finish. On `action: 'reject'`, may also emit `task.escalated` if failure counter breaches `planner_escalation_threshold`.
- `buildWriteSideTools(employee, deps): Tool[]` — composer. Returns empty array for ICs. Returns decompose-only for Officer/Senior Mgmt/Management. Returns delegate+review for Management/Supervisor/Lead. Management appears in both lists intentionally — they get all three.
- Unit tests in `agentic-tools-write.test.ts`: workload-score determinism (10 cases), max-tickets clamp, max-depth clamp, approval-level gating, escalation trigger, role-fit extraction from mock role.md, JSON-safe envelope round-trip.

**Commit:** `feat(m32): M32 T2 — write-side agentic tools + workload scoring`.
**Tests:** ~12 unit.

### T3: Extend `AgenticLoopService` — tool registry injection by level

**Scope:** `agentic-loop-service.ts` gains a level-aware tool builder path.

**Deliverables:**
- `AgenticLoopService.start()` gets a new optional field `employeeId` on the request. Default resolves to the company's `system-agent` (M31 semantics preserved — current call sites unchanged).
- New internal `buildToolsForEmployee(employee, companyId): Tool[]` — returns `[...readSideTools(companyId), ...buildWriteSideTools(employee, deps)]`.
- Update `test-agentic-tools.ts` — add a three-tier seam mirror (`__ECHO_WRITE__:[...]` sentinel → canned per-prompt table → fallback) for `decompose_project` / `delegate_subtask` / `review_deliverable`. Composition root in `main/index.ts` swaps to the test-side builder under `NODE_ENV=test`.
- Existing unit tests continue to green. +5 new tests: level-based injection correctness for each level, system-agent gets all tools, IC gets read-only set, composition-root swap under test env.

**Commit:** `feat(m32): M32 T3 — level-based tool injection + test seam`.
**Tests:** +5 unit.

### T4: New bus event types + shared-types extension

**Scope:** `packages/shared-types/src/events.ts`.

**Deliverables:**
- Add six new members to `EventType` union: `'plan.proposed'`, `'plan.approved'`, `'task.delegated'`, `'task.escalated'`, `'review.requested'`, `'review.completed'`.
- Add matching payload types: `PlanProposedPayload`, `PlanApprovedPayload`, `TaskDelegatedPayload`, `TaskEscalatedPayload`, `ReviewRequestedPayload`, `ReviewCompletedPayload`. All JSON-safe. Discriminator field `type`.
- Extend `AgentStepKind` union with `'ticket_created'` | `'delegation_made'` | `'review_pending'`. Extend `AgentStepPayload` variants accordingly.
- Extend `AgenticRunSnapshot.steps` contract — the new step kinds serialize identically on the live bus AND the snapshot path (M32 T0 wire-shape invariant).
- **Composite-reference dist refresh is now automatic.** `packages/shared-types/package.json::typecheck` is `tsc --build` (not `tsc --noEmit`), so `pnpm -r typecheck` always regenerates `dist/*.d.ts` before downstream consumers read them. The manual `tsc --build --force` dance from pre-M32 is no longer required. See commit that changed this script for the fix shape. If a full rebuild is ever needed (e.g., after deleting dist), run `pnpm -F @team-x/shared-types build`.
- Unit tests: Type-level assertion tests via `vitest`'s `expectTypeOf` for payload discriminator correctness (+3).

**Commit:** `feat(m32): M32 T4 — new event types + step kinds in shared-types`.
**Tests:** +3 unit.

### T5: Confirmation gates in the command palette

**Scope:** `apps/desktop/src/renderer/src/features/command/command-palette.tsx` + `command-service.ts` on the main side.

**Deliverables:**
- `command.execute` extends its `confirmed?: boolean` field to apply to agentic write-side runs. The CommandService inspects the `complex_request` intent entities for a write-side signal (heuristic: presence of verbs like "decompose", "delegate", "assign", "create tickets", "review"); if detected AND `confirmed !== true`, returns a `{ needsConfirmation: true, gateKind: 'write-side' }` envelope to the palette **before** dispatching the agentic loop.
- Palette renders a confirmation gate card between the parsed intent and the step log, with a plain-language summary of what the loop will attempt. Accept → re-call `command.execute({ ..., confirmed: true })`. Reject → closes palette cleanly, no loop starts.
- Existing M30 gates (fire / close / end-meeting / promote) unchanged.
- Bypass rule for trusted flows (Copilot Conversations thread continuation — M33 prep): `skipConfirmation: true` opts out. Not exposed in the palette yet.
- Unit tests: gate-detection heuristic (+4), command-handlers gate-envelope shape (+2), palette confirm-then-execute flow (+2).

**Commit:** `feat(m32): M32 T5 — write-side confirmation gate in palette`.
**Tests:** +8 unit.

### T6: Palette step-card variants for new kinds + AuditView chips

**Scope:** `step-card.tsx` + `audit-view.tsx`.

**Deliverables:**
- `StepCardTicketCreated` — shows ticket title, assignee chip, priority, "Open in Kanban" deep-link (deep-link reuses `tickets.get` IPC under the hood).
- `StepCardDelegationMade` — shows delegation reason, score breakdown (expandable), "Open Thread" deep-link.
- `StepCardReviewPending` — shows ticket title, review status (pending / approved / changes-requested), "Open Ticket" deep-link.
- All three render with `data-step-kind="ticket_created"` | `"delegation_made"` | `"review_pending"` attributes for E2E stability. Each uses the existing `narrowX` helper pattern — soft-validation with graceful fallback, no throws.
- AuditView's event-type filter chips grow from N to N+6. Each new chip gets a Lucide icon (`PackagePlus` / `UsersRound` / `ClipboardCheck`) and the appropriate category group ("Task Planner").
- Unit tests: step-card variant rendering (+3 via data-step-kind selector), narrow-helper graceful fallback on missing fields (+3), audit chip filtering (+2).

**Commit:** `feat(m32): M32 T6 — step-card variants + audit chips`.
**Tests:** +8 unit.

### T7: Settings — planner subsection in Settings → Runtime

**Scope:** `apps/desktop/src/main/services/settings-service.ts` + renderer Settings view.

**Deliverables:**
- Four new clamped settings keys: `planner_max_tickets` (clamp 1–50, default 10), `planner_max_depth` (clamp 1–4, default 2), `planner_approval_level` (enum `'officer' | 'senior_management' | 'management' | 'supervisor' | 'lead'`, default `'management'`), `planner_escalation_threshold` (clamp 1–10, default 3).
- New `settings.getPlanner` / `settings.setPlanner` IPC channels + handlers + preload bridge. Shape mirrors `settings.getAgentic`.
- New "Task Planner" subsection under "Agentic Loop" in Settings → Runtime. Number inputs with inline clamp enforcement + change-reason explanation + save-button disabled until dirty (matches existing Settings subsections).
- Migration: settings are key-value so no DB migration. Seed defaults via `settings-service.seedDefaults()` extension.
- Unit tests: clamp behavior on each key (+4), IPC handler round-trip (+2), seedDefaults applies only to missing keys (+2).

**Commit:** `feat(m32): M32 T7 — planner settings + UI`.
**Tests:** +8 unit.

### T8: E2E spec — `task-planner.spec.ts`

**Scope:** New E2E file under `apps/desktop/e2e/task-planner.spec.ts`.

**Deliverables:**
- Boot Electron with `NODE_ENV=test`. Existing canned classifier returns `complex_request` for the prompt `"decompose the Q2 launch project into tickets for my team"`. New canned provider table entry streams: `plan → tool_call(decompose_project) → tool_result(3 subtasks) → tool_call(delegate_subtask) → tool_result(ticket 42 created) → tool_call(delegate_subtask) → tool_result(ticket 43 created) → tool_call(delegate_subtask) → tool_result(ticket 44 created) → answer`.
- Spec: open palette (`Cmd+K`), type prompt, assert confirmation gate appears with write-side gate kind, click Confirm, assert plan card, assert 3 `data-step-kind="ticket_created"` cards, assert final answer card, assert 3 tickets in kanban (`tickets.list` IPC), assert audit rows for 1 `plan.proposed` + 3 `task.delegated`.
- Extend existing `test-agentic-tools.ts` canned set with write-side entries. Extend `test-agentic-provider.ts` with the scripted multi-tool sequence.
- No new production code in this task — pure test harness extension. Subagent-eligible per M31 T8 pattern (budget 1 subagent pass, coordinator does git-diff + biome spot-check + atomic commit).
- Existing 8 E2E specs still green.

**Commit:** `test(m32): M32 T8 — task-planner.spec.ts E2E round-trip`.
**Tests:** +1 E2E.

### T9: Documentation

**Scope:** Cross-cutting docs update.

**Deliverables:**
- **CLAUDE.md** — status block update (M32 tasks shipped count), Phase 5 block gains M32 entry, IPC table gains `settings.getPlanner` + `settings.setPlanner`, bus events table gains six new event rows, troubleshooting section gains Task Planner block (guardrail-exhausted, workload-score-all-zero, approval-level-blocks-user).
- **CHANGELOG.md** — `[Unreleased]` M32 section listing all 11 shipped tasks with commit SHAs.
- **README.md** — tests badge refresh (964 → ~995, 8 → 9 E2E), Intelligence Layer section gains the Task Planner blurb ("Management agents can decompose projects, delegate subtasks with deterministic workload scoring, and review deliverables — all surfaced in the Cmd+K palette with confirmation gates for destructive writes").
- **`docs/user-guide/task-planner.md`** (NEW, ~200 LOC) — follow F10 user-guide shape: Overview → Mechanics (decomposition flow, workload scoring formula) → Tools (three tools with syntax + examples) → Settings (four keys + when to tune) → Control (confirmation gates, escalation behavior) → Privacy (how write-side tools respect privacy tiers + concurrency caps) → Example (full Q2 launch decomposition transcript) → Troubleshooting.
- **`docs/user-guide/README.md`** — TOC gains Task Planner link.
- **Phase 5 design doc `§14 Follow-ups`** — F1 + F2 struck through with commit refs (`f515ea7` / `62a0504`). §9 Milestone Breakdown table refreshes M32 status to ✅ Complete once T10 is in.
- No new tests.

**Commit:** `docs(m32): M32 T9 — full documentation refresh`.
**Tests:** 0 (docs-only).

### T10: Verification + milestone marker

**Steps:**
1. `pnpm -r typecheck` — clean across all six packages. **NOTE:** run at repo root, NOT `-F @team-x/desktop`. The `shared-types` package's typecheck script is now `tsc --build`, which regenerates `dist/*.d.ts` automatically — the manual `tsc --build --force` dance is no longer required (fixed during the M32 plan-doc session, same commit). If `dist/` is ever deleted, `pnpm -F @team-x/shared-types build` forces a clean rebuild.
2. `pnpm lint` — 0 errors; warnings ≤ 34 (baseline 24 + budget 10 for step-card variants).
3. `pnpm test` — target ~995 unit tests, all green. Net delta from M31 baseline: +~31 over the 964 M32-T0+T1 baseline.
4. ABI rebuild dance: `cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npx node-gyp rebuild --release` (Node ABI), then `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar` (Electron ABI, comma-separated form only — repeated `-w` flags crash `@electron/rebuild@3.7.2`).
5. `pnpm -F @team-x/desktop test:e2e:run` — 9 specs, all green.
6. Commit each task atomically; every work commit followed by a `chore(loki): M32 T<N> — commit ledger (<sha>)` commit updating `.loki/state/orchestrator.json` + `.loki/queue/pending.json` + `.loki/CONTINUITY.md`.
7. Update `.loki/state/orchestrator.json` — move `inFlightMilestone.M32` into `history.M32`; set `currentMilestone: 'M33'`, `previousMilestone: 'M32'`, `previousMilestoneCompletedAt: <ISO>`, baseline refreshed (unit tests, E2E specs, lint warnings).
8. Clear `.loki/queue/pending.json` awaiting M33 plan (or leave `tasks: []` with M33 scope notes).
9. Rewrite `.loki/CONTINUITY.md` top section with an M32-COMPLETE header — commit table (T0 – T10), test delta (964 → ~995 unit + 8 → 9 E2E), patterns-to-carry-forward (workload scoring pattern, confirmation gate pattern, level-based tool injection pattern), next-session checklist for M33 (Copilot Service).

**Commit:** `chore(loki): M32 COMPLETE — verification + ledger`.
**Tests:** 0 (gate-only).

## Summary of deliverables

| Deliverable | Type | Location |
|-------------|------|----------|
| F1 backfill | Renderer hook | `apps/desktop/src/renderer/src/hooks/use-agent-step-stream.ts` (T0 shipped) |
| F2 invalidator | Renderer hook | `apps/desktop/src/renderer/src/hooks/use-chat.ts::useThreadList` (T1 shipped) |
| Write-side tools | Main service | `apps/desktop/src/main/services/agentic-tools-write.ts` (NEW, T2) |
| Workload scorer | Pure function | Same file (T2) |
| Tool registry builder | Main service | `agentic-loop-service.ts::buildToolsForEmployee` (T3) |
| Test seam extension | Test support | `test-agentic-tools.ts` + `test-agentic-provider.ts` canned entries (T3, T8) |
| Bus event types | Shared types | `packages/shared-types/src/events.ts` (T4) |
| Step kind variants | Shared types + UI | `events.ts` + `step-card.tsx` (T4, T6) |
| Write-side confirmation gate | Main service + palette | `command-service.ts` + `command-palette.tsx` (T5) |
| AuditView chips | Renderer | `audit-view.tsx` (T6) |
| Settings keys | Main service + UI | `settings-service.ts` + Settings → Runtime subsection (T7) |
| `settings.getPlanner` / `setPlanner` IPC | IPC | Main handlers + preload bridge + shared-types (T7) |
| E2E spec | Test | `apps/desktop/e2e/task-planner.spec.ts` (NEW, T8) |
| User guide | Docs | `docs/user-guide/task-planner.md` (NEW, T9) |

## Risks + open questions

- **LLM call inside the tool (T2 `decompose_project`) creates a nested provider dispatch.** The outer ReAct scheduler already holds a slot via `providerRouter.complete`; the inner `decompose_project` call will request a second slot. Need to verify concurrency caps still hold. Mitigation: add a `reentrant: true` flag to `providerRouter.complete` to reuse the outer slot, OR keep as-is and document the 2x slot cost as expected. **Recommend:** document the 2x cost; add telemetry; revisit if cap pressure emerges.
- **Role-fit extraction from role.md frontmatter is under-specified.** The design doc says "parsed from role.md capabilities" but the existing 55 role cards don't have a `capabilities` key. Options: (a) add an optional `capabilities: string[]` frontmatter key and backfill across all roles (big scope), (b) derive role-fit from `level` + `role.name` heuristics (smaller scope, less precise), (c) use `decision_authority` as a proxy. **Recommend:** (b) for M32 — ship a simple level+name heuristic; file the role-pack enrichment as an M33/M34 follow-up.
- **Confirmation gate heuristic (T5) is brittle.** Inspecting the intent entities for write-side verbs may miss prompts like "can you help the team decide what to do next" that end up firing write-side tools mid-loop. Mitigation: add a second-level gate at the tool-call level (right before `delegate_subtask` fires for the first time in a given run), surfaced as a `confirm_gate` step card. **Recommend:** ship both gates — palette-level for common case, tool-level for defense in depth.
- **Canned provider table for T8 will be verbose.** Multi-step tool sequences are harder to script than M31's single tool call. Consider a DSL-ish helper (e.g., `canSequence(['plan', 'tool:decompose', 'result:3sub', 'tool:delegate', 'result:ok', ...])`) to keep the test file readable. **Recommend:** build the helper as part of T8; makes M33 copilot specs easier too.
- **Escalation to manager (T2) creates a reverse org-chart lookup.** `scoreEmployee` needs `ctx.manager(employeeId)`. Cheap — org-edges table has the data. But the escalation path fires `task.escalated` which subscribers (AuditView, kanban) need to interpret. **Recommend:** keep simple — escalation just reassigns the ticket to the manager and emits the event; no new UI state.

## Handoff notes for the next session

- **T2 + T3 can be a single session.** T2 is a new file, T3 is the integration. Split commits per task, but no reason to split sessions.
- **T4 is a shared-types edit — run `tsc --build --force` in `packages/shared-types` after the edit, before any downstream typecheck.** The session that runs T4 should bundle the `dist` rebuild into its own commit (no code change, just regen) if the generated output drifts — mirrors how M28 handled `dist/` in the intelligence package.
- **T5 + T6 should be a single session.** The gate and the step cards share UI state shape. If split, the palette test harness is duplicated. Budget ~60 minutes coordinator-time for the pair.
- **T7 is a fast session.** Settings keys are purely additive and the UI pattern is well-established. ~20 minutes.
- **T8 is the big one.** Budget a full session. Subagent the canned-provider table generation. Coordinator does git-diff verification + biome spot-check + atomic commit. Same pattern as M31 T8.
- **T9 is docs-only but NOT skippable.** Partial-truth docs are a cut corner per M31 T9 gotcha. Budget ~45 minutes.
- **T10 is gate-only.** If any gate fails, fix and rerun — do not skip the ABI rebuild, do not skip the composite-dist rebuild.
- **Commit cadence:** `<type>(m32): M32 T<N> — <summary>` for work commits, `chore(loki): M32 T<N> — commit ledger (<sha>)` immediately after each work commit, updating orchestrator.json + pending.json + CONTINUITY.md. Same atomic pattern M30 + M31 used.

---

**Design decisions honored:** D6 (guardrails tool-level) ✅. D7 (workload scoring deterministic) ✅. D8 (write-side in M32, not M31) ✅. D10 (tools are main-process closures, not MCP) ✅.

**Phase 5 §14 Follow-ups closure plan:** F1 closed in T0 (`f515ea7`). F2 closed in T1 (`62a0504`). T9 strikes both through in the design doc.

**Next milestone:** M33 — Copilot Service. Reuses this agentic-loop harness for periodic analysis + ask-the-copilot free-form questions. The tool registry extends further: M33 adds `copilot_*` tools alongside M31's read-side and M32's write-side sets, per the same `buildToolsForEmployee` pattern established in T3.
