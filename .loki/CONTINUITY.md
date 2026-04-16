# Loki Continuity — Phase 5, M32 T3 SHIPPED (level-based tool injection + test seam); M32 T4+ pending

## M32 T3 SHIPPED — 2026-04-15

**Milestone:** Task Planner (Phase 5 — Intelligence Layer). In progress (4 of 11 tasks shipped).
**Scope shipped this session:** Level-based tool-registry injection on `AgenticLoopService` + schema-identical test seam for the three write-side tools. The agentic loop is now level-gated end-to-end from composition root → service → LLM tool registry. M31 wire contract and default semantics preserved — callers that omit `employeeId` still resolve to system-agent.
**Commit:** T3 = `8bf1e9e`.
**Session window:** 2026-04-15T18:00:00Z → 2026-04-15T18:20:00Z (code commit at 18:11 Pacific; ledger commit follows this session).

### Metrics delta

| Metric | Pre-T3 | Post-T3 | Delta |
|---|---:|---:|---:|
| Unit tests | 989 | 1000 | +11 |
| E2E specs | 8 | 8 | 0 |
| Lint errors | 0 | 0 | 0 |
| Lint warnings (workspace) | 24 | 24 | 0 |
| Typecheck across 6 packages | clean | clean | — |
| Files touched | — | 5 (+744 / −24) | — |

### What shipped (one feat commit, five files)

**Service layer — `apps/desktop/src/main/services/agentic-loop-service.ts` (+107 LOC):**

- New types `AgenticLoopEmployeeContext` + `AgenticLoopEmployeeLookup` — the actor identity the loop threads through every touchpoint.
- `AgenticLoopEmployeesRepo` widened with optional `getById(employeeId): AgenticLoopEmployeeLookup | null` — keeps M31 surface untouched while enabling explicit actor resolution.
- `buildTools` deps signature now carries `employee: AgenticLoopEmployeeContext` so level-based composition happens at the service boundary, not inside the scheduler.
- `StartArgs` gains optional `employeeId?: string`. `start()` resolves the actor via either the explicit `getById` path or a default fallback to the system-agent. Cross-company isolation is validated before dispatch (a fetched employee with a mismatched `companyId` is rejected). `actorEmployee` threads through members / runs row / message authors / bus-event `authorId`.
- Critical wire-stability detail: the `RunState.systemAgentId` field name is preserved even when the actor is NOT the system agent. This keeps M31's wire contract stable — renderers keyed on `systemAgentId` don't need patching. Internally the field holds `actorEmployee.id` regardless.

**Test seam — NEW `apps/desktop/src/main/services/test-agentic-tools.ts` (+298 LOC):**

- `ECHO_WRITE_SENTINEL` literal + per-tool canned tables — the `__ECHO_WRITE__:[…]` JSON sentinel short-circuits to a deterministic envelope, the canned per-prompt table handles test fixtures, the fallback produces a deterministic default. Three-tier resolution mirrors `test-classifier.ts` (M30 T8) and `test-agentic-provider.ts` (M31 T3) posture.
- Schema-identical `decompose_project` / `delegate_subtask` / `review_deliverable` factories — the zod schemas match production `agentic-tools-write.ts` byte-for-byte so the LLM sees the same tool surface under `NODE_ENV=test`.
- `createTestToolsForEmployee(employee, companyId, deps)` — level-gated composer that mirrors `buildWriteSideTools` exactly. Supervisor/Lead get `[delegate_subtask, review_deliverable]`; Management/system get all three; Officer/Senior-Mgmt get `[decompose_project]`; IC gets `[]`. Lockstep invariant: if production gates change, this must change in the same commit.
- `createTestWriteSideTools(employee, deps)` — standalone factory for unit-test consumption (no composition required).

**Composition root — `apps/desktop/src/main/index.ts` (+131 LOC):**

- `buildTools` closure receives `employee` and branches on `testMode`. Production: `[...readSideTools, ...buildWriteSideTools(employee, writeSideDeps)]`. Test: `createTestToolsForEmployee(...)`.
- Production `writeSideDeps` carries:
    - **Workload provider** — conservative open-ticket count from `ticketsRepo.countOpenByAssignee(employeeId)` for `load`. `inMeeting` and `avgCompletionDays` are stubbed (returns `false` and `0` respectively) and explicitly annotated as M33-pending. This is deliberate — M32 ships the Task Planner with a conservative workload shape; M33 wires the observability layer.
    - **Write-side orchestrator enqueue** — a no-op today. M33 wires the real path when the Copilot service starts issuing directives autonomously. Preserving the hook surface avoids a future breaking change.
    - **`WriteSideCompleteFn`** — wraps `streamAgent` to resolve the ACTOR's provider per call (not the system agent's). A CTO running through `decompose_project` uses the CTO's provider pref, not the copilot's.
- `employeesRepo` facade gains `getById(id)` → maps `EmployeeRow → AgenticLoopEmployeeLookup` with `isSystem: row.is_system ?? false` null-safe fallback (Drizzle nullable column semantics).

**Service tests — `agentic-loop-service.test.ts` (+115 LOC, +4 tests):**

- **M32 T3 default-actor capture** — omitting `employeeId` captures the system-agent row onto `RunState` (name + id) and preserves M31's wire contract.
- **M32 T3 explicit employeeId resolution** — passing an `employeeId` resolves via `getById()`, authors outgoing messages as that employee, and tags bus events with `authorId: employee.id`.
- **M32 T3 unknown id throws side-effect-free** — an unresolvable `employeeId` throws before any side effect (no members, no runs row, no bus events).
- **M32 T3 cross-company guard** — an employee from company A passed to a run for company B is rejected.

**Test-seam tests — NEW `test-agentic-tools.test.ts` (+117 LOC, +7 tests):**

- System-agent gets all three write-side tools.
- IC gets none (read-only loop).
- Officer + Senior-Mgmt get `decompose_project` only.
- Management + system get all three.
- Supervisor + Lead get `delegate_subtask` + `review_deliverable`.
- `createTestWriteSideTools` standalone factory produces `[]` for IC.
- `createTestWriteSideTools` is schema-identical to production `buildWriteSideTools` (zod schema shape identity check).

### Verification gates passed (per commit message)

- `pnpm -r typecheck` clean across all 6 workspaces.
- `biome check` clean on the 5 touched files (auto-fixed import order in `main/index.ts` and `test-agentic-tools.test.ts` during the work; biome recommit clean).
- `vitest`: `agentic-loop-service.test.ts` (25), `test-agentic-tools.test.ts` (7), `agentic-tools-write.test.ts` (25), `agentic-tools.test.ts` (40) all green.

### Gotchas captured this session

- **`systemAgentId` field name stability is non-negotiable.** The renderer-side hooks and E2E selectors introduced in M31 T5/T6 key on this name. Widening the semantic to "actor id (defaults to system-agent)" without renaming is the right call — renaming would cascade a patch across the palette, the Copilot thread surface, and the `agentic-loop.spec.ts` spec.
- **Cross-company isolation check belongs in `start()`, not `buildTools`.** Putting it in `buildTools` leaks per-call cost and only catches the first tool call, not the run dispatch. The guard fires before any membership/run row/bus event is created — side-effect-free rejection is the contract.
- **Workload provider's `inMeeting` / `avgCompletionDays` stubs are deliberate.** The deterministic scorer accepts them; M33 wires the live observability layer. Don't chase them before M33 — the stubs keep the write-side loop shippable at M32 with conservative-by-design workload estimates.
- **Biome auto-fix import-order behavior** — `main/index.ts` and `test-agentic-tools.test.ts` triggered the import sorter. Running `biome check --write` before the work commit is the correct posture; catching it after commit would require a noisy follow-up.

### Patterns reinforced

- **Three-tier canned seam pattern is now the canonical shape for every agentic surface.** `test-classifier.ts` (M30) + `test-agentic-provider.ts` (M31) + `test-agentic-tools.ts` (M32) form the locked triad. Every new agentic surface ships with a matching `__ECHO_*__` sentinel + canned table + fallback. Any breaking change to the sentinel format ripples across all three.
- **Lockstep invariant: production gate and test gate change in the same commit.** Both `buildWriteSideTools` (agentic-tools-write.ts, production) and `createTestWriteSideTools` (test-agentic-tools.ts, test) branch on the same `EmployeeLevel` set. Splitting the change across commits creates a window where the test seam drifts from prod — reject any such PR in review.
- **Wire-stability field names trump semantic precision** when renaming would cascade across the renderer. `systemAgentId` now means "actor id, defaulting to system-agent" — the widening is reflected in documentation, not in code.

### Next Session Startup Checklist (M32 T4+)

1. Read this CONTINUITY file — most recent session at the top.
2. Read `.loki/state/orchestrator.json` → `inFlightMilestone.M32.commits` shows T0+T1+T2+T3 shipped; `tasksCompleted: 4`; baseline 958 / current 1000.
3. Read `.loki/queue/pending.json` → `tasks` array shows T0+T1+T2+T3 with `status: shipped`. T4–T10 spec lives in the M32 plan doc.
4. **T4 is the shared-types promotion.** Promote the `WriteSideEventType` literals from `agentic-tools-write.ts` into the canonical `EventType` union in `packages/shared-types/src/events.ts`. Add `AgentStepKind` variants `'ticket_created' | 'delegation_made' | 'review_pending'` plus matching `AgentStepPayload` narrow-types. Replace `'plan.proposed' satisfies WriteSideEventType` annotations in tool bodies with `satisfies EventType` for canonical narrowing.
5. **T4 must ALSO rebuild shared-types dist.** The composite-TS-project gotcha is resolved via `packages/shared-types/package.json::scripts.typecheck = tsc --build` (commit 83e0868) — `pnpm -r typecheck` now emits dist/\*.d.ts automatically, no manual `tsc --build --force` dance required. But if you add new exported types, confirm the dist reflects them via a clean `rm -rf packages/shared-types/dist && pnpm -r typecheck`.
6. **T4 string-literal immunity check.** T2's `agentic-tools-write.test.ts` uses string-literal discriminators (`type: 'plan.proposed'` etc.) by construction, so adding new EventType variants should NOT regress T2. If it does, the T4 commit has renamed the discriminator field — that's a breaking change and the commit is wrong.
7. **T5 = confirmation gate** for destructive writes (`decompose_project` creating tickets, `delegate_subtask` creating delegations). Mirrors the M30 T4 gate for `fire` / `close` / `end-meeting` / `promote` — a `confirmed: true` flag on the palette-level intent that must be set before the tool actually fires.
8. **T6 = step-card variants** for the three new `AgentStepKind`s. Update `apps/desktop/src/renderer/palette/step-card.tsx` in lockstep with the shared-types promotion. `data-step-kind="ticket_created" | "delegation_made" | "review_pending"` as stable E2E selectors.
9. Commit cadence: `<type>(m32): M32 T<N> — <summary>` for the work commit, immediately followed by `chore(loki): M32 T<N> — commit ledger (<sha>)` updating orchestrator.json + pending.json + CONTINUITY.md.
10. After T10, move M32 from `inFlightMilestone` into `history`, set `currentMilestone: 'M33'`, rewrite CONTINUITY top with M32-COMPLETE header + commit table.

### Open items carried into T4+

- F1 and F2 follow-ups are closed (T0 + T1 of M32).
- `agentic-loop.spec.ts` does not yet exercise the write-side surface. Recommend extending it (or adding a `task-planner.spec.ts`) during T8 so both the `ticket_created` / `delegation_made` / `review_pending` step kinds and the confirmation gate have E2E coverage.
- No open bugs. No failing tests. No signal files in `.loki/signals/`.

---

## M32 T2 SHIPPED — 2026-04-15

**Milestone:** Task Planner (Phase 5 — Intelligence Layer). In progress.
**Scope shipped this session:** Write-side agentic tools — `decompose_project`, `delegate_subtask`, `review_deliverable` — plus the deterministic workload scorer locked to Phase 5 §7.4 weights. New file `apps/desktop/src/main/services/agentic-tools-write.ts` (~1,150 LOC) and companion test file `agentic-tools-write.test.ts` (25 tests, all green). No changes to read-side or existing services — T3 is the integration step.
**Commit:** T2 = `cdf7315`.
**Session duration:** 2026-04-15T15:55:00Z → 2026-04-15T16:10:00Z.

### Metrics delta

| Metric | Pre-T2 | Post-T2 | Delta |
|---|---:|---:|---:|
| Unit tests | 964 | 989 | +25 |
| E2E specs | 8 | 8 | 0 |
| Lint errors (new files) | 0 | 0 | 0 |
| Lint warnings (workspace) | 24 | 24 | 0 |
| Typecheck across all packages | clean | clean | — |

### What shipped (one file, one test file, one commit)

- **`agentic-tools-write.ts`** — three Tool factories matching M31 T2's read-side API shape:
  - `buildDecomposeProjectTool(deps)` — gates on `planner_max_depth` + `planner_approval_level`, calls `deps.providerComplete` once for the LLM-side subtask generation, scores every visible employee against every parsed subtask via `scoreEmployee`, returns `DecomposedPlan = { planId, projectId, goalId, subtasks: PlanSubtask[], truncated }`. Emits `plan.proposed`. Truncates to `planner_max_tickets` and surfaces the `truncated` marker so the loop can re-plan with a tighter cap.
  - `buildDelegateSubtaskTool(deps)` — validates the assignee chain (primary → fallbacks), skips over-load-cap candidates, accepts the first available, calls `ticketsRepo.create` + `ticketsRepo.assign`, links to project via `projectsRepo.linkTicket` when `parentProjectId` is supplied, emits `task.delegated`. On exhausted chain, increments `EscalationTracker.recordFailure(planId)` and emits `task.escalated` once `planner_escalation_threshold` is crossed. Returns `DelegationResult = { ticketId, assigneeId, assigneeName, status, fallbackUsed, attemptCount }`.
  - `buildReviewDeliverableTool(deps)` — guards on `ticket.status === 'done'`, emits `review.requested` up front (so renderer can render a pending card before the LLM call), runs one `deps.providerComplete` for a plain-language summary, emits `review.completed`. On `action: 'reject'` with `planId`, increments tracker and emits `task.escalated` on threshold. Returns `ReviewResult = { ticketId, outcome, summary, escalated }`.
- **Deterministic `scoreEmployee(employee, subtask, ctx)`** — pure, exported, locked to weights `0.4·role_fit + 0.3·(1-load_ratio) + 0.2·availability + 0.1·past_performance`. Past-performance defaults to 0.5 when `avgCompletionMs === null` (new hires not penalized). System / archived / fired employees score `0`.
- **`computeRoleFit`** — keyword heuristic over employee `title` + `level` (Risk #2 option (b) per the M32 plan). Engineer titles match `implement` subtasks above level baseline; non-matching titles fall to `LEVEL_BASELINE_FIT` (officer/sm/management = 0.55, supervisor/lead = 0.5, ic = 0.45, system = 0). Capabilities-frontmatter enrichment is the deferred M33/M34 follow-up.
- **`buildWriteSideTools(employee, deps)`** — level-gated composer. ICs return `[]`. Officer/Senior-Mgmt → decompose only. Supervisor/Lead → delegate + review. Management/system → all three.
- **`PLANNER_DEFAULTS`** — module constants matching design §11 defaults: `maxTickets=10`, `maxDepth=2`, `approvalLevel='management'`, `escalationThreshold=3`, `loadDenominator=5`, `pastPerformanceCeilingMs=48h`. T7 will swap the static accessor for the settings repo via `deps.getPlanner`.
- **`WriteSideEventBus` interface** — `type: string` (wider than `EventType`), so the existing `AgenticLoopEventBus` drops in unchanged for T3 wiring before T4 promotes the six new event-type literals into the canonical union.
- **`EscalationTracker`** + `createInMemoryEscalationTracker()` — per-plan failure counter. T3 will pin one tracker per `runId`.
- **25 unit tests** — score determinism (10 round-trip cases), weights sum 1.0, system/archived/fired score 0, availability/load/past-perf monotonicity, role-fit heuristic correctness, decompose clamps + approval-level gate, JSON-safe envelope round-trip via `JSON.stringify/parse`, delegate happy path + fallback chain + escalation threshold + project linkage, review unfinished-ticket reject + happy path + reject+threshold escalation, composer level-gating across all six levels, bus-emit-throws non-fatal.

### Verification gates passed

- `pnpm -r typecheck` — clean across all six packages on first run after fixing one strict-noUncheckedIndexedAccess error in `isApprovedLevel` (replaced `?? rank.management` with explicit `?? MGMT_RANK` literal).
- `pnpm exec biome check apps/desktop/src/main/services/agentic-tools-write*.ts` — 0 errors after one auto-fix pass (quote style + multi-line concat → template literal).
- `pnpm test` repo-wide — 989 / 989 pass (+25 from M32 baseline of 964). Single pre-existing sqlite-vec test failure in `vec-init.test.ts` is unrelated and predates M32.
- Tests targeted at the new file pass in 21ms with no flakes across 3 separate runs.

### Gotchas captured this session

- **`tsc --strict noUncheckedIndexedAccess` chains** — `Record<string, number>` indexed access returns `number | undefined`. The `?? fallback` only narrows if the fallback itself is non-undefined; pulling another `rank.x` from the same record stays possibly-undefined. Fix: bind a literal-typed const (`const MGMT_RANK = 3`) and use that as the nullish fallback. Pattern applies anywhere we use `Record<K, V>` rank/lookup tables.
- **Biome `noUselessStringConcat` is unsafe-fix only** — multi-line `'foo' + 'bar' + 'baz'` chains for long strings are flagged but the rewrite to a single template literal must be done by hand or with `--write --unsafe`. We did the rewrite by hand for the one decompose system-prompt to keep the auto-fix surface explicit.
- **Width-compatible bus seam pattern** — when a downstream task (T4) will widen / promote a string-literal union into the canonical type, the in-progress task can declare its own `interface SomethingBus { emit<T>(input: { type: string; ... }) }`. The existing strongly-typed bus passes structurally because `string` is wider than the constrained union. Avoids touching `shared-types` out of order.
- **Test-file `vi.fn` import is needed** — Biome auto-fix will remove it if `vi` is not used. Keep it explicit in the import for orchestrator stub even if mock-call assertions aren't currently asserted on; future tests will lean on it.

### Patterns reinforced

- **Repo + test mirror M31 T2 discipline** — same hand-rolled fake repos, same `{rows, truncated}` envelope vocabulary (extended with `{created, escalated}` for write-side artifacts), same `checkAborted(ctx)` first-line guard in every `execute`, same `Object.freeze` on returned arrays for runtime immutability.
- **JSON-safe envelopes are testable** — every result type round-trips through `JSON.stringify(parse(x))` cleanly. The test asserts this directly for `decompose_project` to lock in the no-Date / no-Buffer / no-Drizzle-row contract.
- **One LLM call per tool body, never per loop iteration** — `decompose_project` and `review_deliverable` each invoke `providerComplete` exactly once. The outer ReAct scheduler holds its own provider slot. Risk #1 in the M32 plan (nested provider dispatch under one loop run) stays at 2x slot cost as documented; revisit if cap pressure surfaces.
- **Defense in depth for level gating** — `buildWriteSideTools` filters at registry construction AND `decompose_project`'s body re-checks `isApprovedLevel(actor.level, planner)`. Mirrors the read-side `isSystem` belt-and-suspenders pattern.

### Next Session Startup Checklist (M32 T3+)

1. Read this CONTINUITY file — most recent session at the top.
2. Read `.loki/state/orchestrator.json` → `inFlightMilestone.M32` for T0+T1+T2 shipped state + `tasksCompleted: 3`, `baseline.unitTests: 964`, current at 989.
3. Read `.loki/queue/pending.json` → `tasks` array shows T0 + T1 + T2 with `status: shipped`. T3 spec lives in the M32 plan doc §"T3: Extend AgenticLoopService — tool registry injection by level".
4. **T3 is the integration step.** New `buildToolsForEmployee(employee, companyId): Tool[]` on `AgenticLoopService` that returns `[...readSideTools(companyId), ...buildWriteSideTools(employee, deps)]`. Add an optional `employeeId` field to `AgenticLoopService.start()` request — default resolves to system-agent (M31 semantics preserved). Composition root in `main/index.ts` swaps to `createTestAgenticTools` + write-side test seam under `NODE_ENV=test`.
5. **T3 also extends `test-agentic-tools.ts`** with a three-tier seam mirror (`__ECHO_WRITE__:[...]` sentinel → canned per-prompt table → fallback) for the three new tools. Deterministic envelopes per tool name. Mirrors M31 T8's `test-agentic-tools.ts` posture — production + dev use `createAgenticTools`, only `NODE_ENV=test` swaps in.
6. **T4 promotes the `WriteSideEventType` literals** into the canonical `EventType` union in `packages/shared-types/src/events.ts`, plus `AgentStepKind` gets `'ticket_created' | 'delegation_made' | 'review_pending'` and `AgentStepPayload` variants. The `WriteSideEventBus` interface in `agentic-tools-write.ts` already has `type: string` — no breaking change required, but the `'plan.proposed' satisfies WriteSideEventType` annotations in the tool bodies should be replaced with `satisfies EventType` for the canonical narrowing.
7. T2 unit tests are immune to T4's shared-types changes by construction (string-literal `type: 'plan.proposed'` etc.). Adding new event-payload narrow types in T4 should NOT regress T2 tests; if it does, the discriminator field name has changed and the T4 commit is wrong.
8. Commit cadence per CLAUDE.md + M32 plan: `<type>(m32): M32 T<N> — <summary>` for the work commit, `chore(loki): M32 T<N> — commit ledger (<sha>)` immediately after, updating orchestrator.json + pending.json + CONTINUITY.md.
9. After T10, move M32 from `inFlightMilestone` into `history`, set `currentMilestone: 'M33'`, rewrite CONTINUITY top with M32-COMPLETE header + commit table.

---

## M32 T0 + T1 SHIPPED — 2026-04-15

**Milestone:** Task Planner (Phase 5 — Intelligence Layer). In progress.
**Scope shipped this session:** M31 follow-ups F1 + F2 (see M31 `followUps` in orchestrator history).
**Commits:** T0 = `f515ea7` (F1 backfill), T1 = `62a0504` (F2 invalidator).
**Session duration:** 2026-04-15T15:18:00Z → 2026-04-15T15:27:00Z.

### Metrics delta

| Metric | Pre-T0 | Post-T1 | Delta |
|--------|--------|---------|-------|
| Unit tests | 958 | **964** | **+6** (4 agentic-loop-service + 2 command-handlers) |
| E2E specs | 8 | **8** | 0 (no new specs — renderer-only fixes) |
| Lint errors | 0 | **0** | 0 |
| Lint warnings | 24 | **24** | 0 |
| Typecheck | clean | **clean** | 0 |

### T0 — F1 useAgentStepStream backfill on mount (`f515ea7`)

**Root cause closed:** Under fast providers (canned seam, small local models) the agentic loop completes in sub-millisecond time and every `agent.step` / `agentic.completed` event fires before the React bus subscription attaches — the palette step-log would show only the terminal answer card (or nothing at all). Documented as F1 in [design doc §14](../docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md#14-follow-ups-post-m31).

**Fix shape (10 files, 417 insertions):**

| Layer | File | Change |
|-------|------|--------|
| shared-types | `packages/shared-types/src/events.ts` | New `AgenticRunSnapshot` wire type — `{ runId, threadId, steps: AgentStepPayload[], terminal: {kind:'completed',payload}\|{kind:'failed',payload}\|null }`. Terminal discriminated-union mirrors the hook's `AgentStreamResult` byte-for-byte. |
| shared-types | `packages/shared-types/src/ipc.ts` | New `command.getRunSnapshot` IPC channel + `TeamXApi.command.getRunSnapshot(runId)` surface. Imports `AgenticRunSnapshot`. |
| main/services | `agentic-loop-service.ts` | New `getRunSnapshot(runId)` method on the service interface + implementation. Pure projection of `state.steps` via existing `projectStepBody()` into JSON-safe `AgentStepPayload[]` + terminal synthesis that matches `finishRun()`'s emit shape exactly. Returns `null` for unknown / evicted runs. |
| main/services | `agentic-loop-service.test.ts` | +4 tests: null for unknown, projection+completed terminal, in-flight terminal=null, failed projection with reason parity. |
| main/ipc | `command-handlers.ts` | Thin `command.getRunSnapshot` adapter — imports `AgenticRunSnapshot`, adds channel to `CommandHandlers` record, registers handler factory. |
| main/ipc | `command-handlers.test.ts` | +2 tests: forwards runId + echoes projection, returns null untouched for unknown runId. `makeAgenticMock` extended with `getRunSnapshot` + 5→6 expected channel keys. |
| main | `index.ts` | `ipcMain.handle('command.getRunSnapshot', ...)` registration next to `command.stop`. |
| preload | `api.ts` | `commandGetRunSnapshot` channel constant + `command.getRunSnapshot(runId)` bridge method + `AgenticRunSnapshot` import. Biome auto-formatted on save. |
| renderer | `hooks/use-agent-step-stream.ts` | Hook signature extended — `useAgentStepStream(threadId, runId?)`. On mount, if runId provided: one-shot `ipc.command.getRunSnapshot(runId)` call BEFORE listener attach. `seen: Set<string>` keyed by `(runId, stepIndex)` absorbs any step that races the backfill. `result` latches to whichever of snapshot terminal / live terminal arrives first. Silent catch on IPC failure — falls through to live-only, matching pre-F1 behavior. |
| renderer | `features/command/command-palette.tsx` | `StepLogView` passes `runId` to the hook (already available as a prop; comes back from `command.execute`'s `{ runId, threadId }` response). |

**Wire-shape invariant:** The snapshot's `AgentStepPayload[]` is byte-for-byte identical to what `agent.step` emits on the bus. Any wire drift breaks the `(runId, stepIndex)` dedup. If a future write-side step kind (`ticket_created`, `delegation_made`, `review_pending`) is added, extend `AgentStepKind` in `events.ts` AND the switch in `projectStepBody` AND the hook's merge logic in lockstep.

### T1 — F2 useThreadList bus invalidator (`62a0504`)

**Root cause closed:** `useThreadList` had no dashboard event subscription — a thread list opened before an agentic run completes showed stale "No threads yet" copy until manual refetch, so users missed the live Copilot thread. Documented as F2 in design doc §14.

**Fix shape (1 file, 25 insertions):**

- `apps/desktop/src/renderer/src/hooks/use-chat.ts` — `useThreadList(companyId)` gains a `useEffect` that subscribes to `ipc.events.onDashboard`, invalidates `['threads', companyId]` on `agentic.completed` / `agentic.failed`, and cleans up on unmount. Satisfies architectural invariant #11 (IPC mutations must emit a bus event; renderer caches subscribe for invalidation).

No new tests — the invalidator is declarative plumbing with no branching. The workspace's Vitest config is node env (no jsdom wiring), so renderer-hook tests would require new infrastructure. Future M32 write-side E2E specs will exercise this path naturally when the Copilot thread list renders during a live agentic run.

### Gotchas captured this session

1. ~~**Composite TS project references read shared-types `dist/*.d.ts`, not `src/`.**~~ **RESOLVED same session (plan-doc follow-up).** Root cause was `packages/shared-types/package.json::scripts.typecheck = "tsc --noEmit"` — this passed without emitting `dist/`, so downstream composite-reference consumers kept reading stale declarations. Fix: change `typecheck` to `tsc --build` (always emits + incremental, so no perf hit on clean runs) and add `build: tsc --build --force` + `clean: tsc --build --clean`. Verified: `rm -rf packages/shared-types/dist && pnpm -r typecheck` is green end-to-end across all six packages. The manual `cd packages/shared-types && npx tsc --build --force` dance is no longer required. M32 plan doc T4 + T10 updated in lockstep.
2. **ABI rebuild dance required before unit tests.** Initial `pnpm -F @team-x/desktop test` run after switching from E2E surfaced `NODE_MODULE_VERSION` mismatch on better-sqlite3 for `vec-init.test.ts` and `embeddings.test.ts`. Node ABI rebuild via `cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npx node-gyp rebuild --release` fixed both. Carries forward from M31's T10 guidance.

### Patterns reinforced

- **Pre-flight reconnaissance via `ctx_batch_execute`.** Single batched call with 8 commands + 6 queries replaced what would have been 14+ individual Bash/Read calls for pre-edit reconnaissance. Keeps context lean for the long implementation tail.
- **Atomic per-task commits with descriptive commit bodies.** T0 and T1 shipped as two separate commits, each with the what/why/test-count captured in the body. Mirrors the M30/M31 ledger pattern. The ledger commit follow-up is the next task below.

### Next Session Startup Checklist (M32 T2+)

1. Read this CONTINUITY file — most recent session at the top.
2. Read `.loki/state/orchestrator.json` → `inFlightMilestone.M32` for the T0+T1 shipped state + `currentMilestone: 'M32'`, `tasksCompleted: 2`, `baseline.unitTests: 964`.
3. Read `.loki/queue/pending.json` → `tasks` array has T0 + T1 marked `shipped`; `totalTasks` is `null` until the M32 plan doc is written and T2+ get filed.
4. **Write the M32 plan doc** at `docs/plans/2026-04-15-team-x-phase-5-m32-task-planner.md`. Structural template: M31 plan doc. Required sections: Overview, What ships, Invariants preserved, Success criteria, Task breakdown (T2–TN), Acceptance criteria (reiterate three-tier test seam + ABI rebuild dance + atomic-commit discipline + **new: shared-types dist rebuild step after type changes**).
5. T2+ headline — write-side tool set (`decompose_project`, `delegate_subtask`, `review_deliverable`):
   - Production impl in `apps/desktop/src/main/services/agentic-tools-write.ts` (new file) or extend `agentic-tools.ts` with a separate exports block.
   - Extend `test-agentic-tools.ts` with write-side cases.
   - New bus event types: `plan.created`, `plan.updated`, `task.delegated`, `task.reviewed`, `review.approved`, `review.rejected`. Add to `EventType` union in `events.ts` + any specific payload types needed.
   - Extend `AgentStepKind` with new write-side kinds: `ticket_created`, `delegation_made`, `review_pending` — and update the hook's merge logic + the palette's `step-card.tsx` variants in lockstep.
   - Audit-log visibility — AuditView event-type filter chips must include the new events.
   - Confirmation gates for destructive writes (ticket creation, delegation).
6. Guardrails remain tool-level, not prompt-level (design decision D6). Workload scoring stays deterministic (D7).
7. Commit atomically per task; follow-up with `chore(loki): M32 T<N> — commit ledger (<sha>)` commits.

## M31 COMPLETE — 2026-04-15

**Milestone:** Agentic Loop (read-side).
**Phase:** 5 — Intelligence Layer.
**Duration:** 2026-04-14 → 2026-04-15 (T0 opened 2026-04-14T02:15:00Z, T10 final verification passed 2026-04-15T21:20:00Z).
**Plan doc:** [`docs/plans/2026-04-14-team-x-phase-5-m31-agentic-loop.md`](../docs/plans/2026-04-14-team-x-phase-5-m31-agentic-loop.md).
**Design reference:** [`docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`](../docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md) §4 + §7 + §14 (new follow-ups).

### Metrics delta

| Metric | Baseline (post-M30) | Target | Final | Delta |
|--------|---------------------|--------|-------|-------|
| Unit tests | 819 | ~905 | **958** | **+139** (exceeded target by +53) |
| E2E specs | 7 | 8 | **8** (8/8 green) | **+1** |
| Lint errors | 0 | 0 | **0** | 0 |
| Lint warnings | 66 | ≤76 | **24** | **-42** (improved) |
| Typecheck | clean | clean | **clean** | 0 |

### Tasks shipped (11/11)

| Task | Commit | Deliverable | Tests |
|------|--------|-------------|-------|
| T0 | `4f30efa` | System-agent seed + `is_system` column (migration 0010) + partial index + `system-agent.md` role card under `role-packs/strategia-official/roles/system/` + `ensureSystemAgent(companyId)` bootstrap | +89 employees.test + 151 bootstrap.test + 72 ipc/handlers tests |
| T1 | `67e0136` | `@team-x/intelligence/src/loop/` — pure ReAct scheduler, tool registry, prompt builder, loop factory. Zero Electron/DB/fs coupling. Forward-scan brace-balanced JSON parser with one-shot nudge recovery. Hard step/token/wall-clock budgets | +33 unit (19 loop + 8 tool-registry + 6 prompt) |
| T2 | `7b5c4f9` | `agentic-tools.ts` — 6 read-only tools wrapping employees/tickets/projects/meetings/vault/events repos with `{rows, truncated}` envelopes (50-row cap, 200-char summary) + defensive `isSystem` filter on employees | +40 unit |
| T3 | `791e6f6` | `AgenticLoopService` — `start/stop/getRun/waitForRun`, pause-aware `providerRouter.complete` wrapper (polls `orchestrator.isCompanyPaused`), `AbortController` with canceled-status coercion, `agent.step`/`agentic.completed`/`agentic.failed` bus events + shared-types payloads, `runs` row with kind `'agentic'`. `test-agentic-provider.ts` three-tier canned seam (sentinel/table/fallback) | +25 unit (17 service + 8 provider) |
| T4 | `179569a` | CommandService → AgenticLoopService wiring. `CommandHandlers.agenticLoopStart(req): { runId, threadId }` mirrors `employeesFire`/`employeesPromote` shape; replaces T4 M30 stub at `command-service.ts:770-775` with real dispatch. `ExecuteResult` gains `runId`/`threadId`. Composition root `main/index.ts` wires test-mode swap | +5 unit |
| T5 | `0cd9e76` | System-agent thread UX — Copilot Conversations section in chat sidenav (Sparkles icon, read-only compose), persisted step transcript rendered inline in chat drawer with step-card variants, `useAgentStepStream` hook + `system-agent-badge.tsx` | +6 unit |
| T6 | `29ed9d2` | Palette step-log mode — 6 UI states, `data-step-kind` stable E2E selectors, provider+token footer per step, Cancel button, `command.stop` IPC channel + handler + preload bridge | +0 unit (E2E coverage in T8) |
| T7 | `51defad` | Settings — 3 clamped keys (`agentic_max_steps=8`, `agentic_max_tokens=8000`, `agentic_timeout_ms=120000`) with `settings.getAgentic`/`settings.setAgentic` IPC channels + Agentic Loop subsection in Settings → Runtime | +8 unit |
| T8 | `31227d1` | E2E spec `agentic-loop.spec.ts` — full round-trip via classifier/provider/tools seams. Canned classifier → complex_request → plan → query_employees tool call → tool result → grounded answer → persisted thread → audit row | +1 E2E (8/8 green) |
| T9 | `183562d` | Docs — CLAUDE.md status + Phase 5 block + IPC + bus events + troubleshooting; CHANGELOG [Unreleased] M31 entry; README tests-badge + Intelligence section + architecture refresh; `docs/user-guide/agentic-loop.md` (NEW, 247 LOC); `docs/user-guide/README.md` TOC; Phase 5 design doc §9 resequence + §10 + §11 + §13 + new §14 Follow-ups | 0 (docs-only) |
| T10 | (this ledger commit) | Verification — typecheck/lint/test/e2e all green; ABI rebuild dance documented; orchestrator.json M31→M32; pending.json cleared; CONTINUITY.md rewritten | 0 (state-only) |

### Scope preserved

- **Read-side only.** Six tools, zero writes. Write-side (`decompose_project` / `delegate_subtask` / `review_deliverable`) deferred to M32 per design decision D8 (locked 2026-04-14).
- **All 11 invariants honored.** Renderer pure view; orchestrator-only scheduler (pause-aware wrapper is additive, not a bypass); MCP host singleton untouched (agentic tools are main-process closures, NOT MCP — D10); provider router is the only LLM touch-point; SQLite + filesystem vault unchanged; events append-only (three new types); zero phone-home; keytar for secrets; role-pack overrides preserved for `system-agent.md`; adaptive runtime strategy; IPC mutations emit bus events (invariant #11 — `agent.step` fires on every step).

### Follow-ups queued (post-M31, pre-M32)

Both land in design doc [§14 Follow-ups](../docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md#14-follow-ups-post-m31). Recommend landing at M32 T0/T1 — both are renderer-only and small:

| # | Follow-up | Size |
|---|-----------|------|
| F1 | `useAgentStepStream` backfill on mount — under fast providers the loop completes before React Query attaches the bus subscription. Fix: `getSteps(runId)` query on mount before attaching the listener | ~20 LOC + 2–3 unit tests |
| F2 | `useThreadList` has no `agent.*` bus invalidator — stale "No threads yet" copy if the list was opened pre-run-complete | ~2 LOC + 1 unit test |

### Patterns to carry forward into M32

- **Three-tier canned test seam is the E2E pattern for every agentic surface.** Classifier + provider + tools each ship a `__ECHO_*__:<json>` sentinel + canned per-key table + fallback. Any M32 write-side tool (`decompose_project`, `delegate_subtask`, `review_deliverable`) MUST ship a matching `test-agentic-write-tools.ts` seam in lockstep — new production tools are not shippable without a test-mode swap in the composition root.
- **`{rows, truncated}` envelope is locked for all agentic tools.** 50-row cap. 200-char payload summary. The LLM tightens filters on truncation. Write-side tools may need a different envelope shape for confirmation artifacts (e.g., `{created: [...], failed: [...]}`) — but the read-side pattern is not negotiable.
- **`data-step-kind` stable selector pattern.** All step-card variants set `data-step-kind="plan" | "tool_call" | "tool_result" | "answer" | "error"`. Extend (don't replace) for M32 write-side step kinds — e.g., `data-step-kind="ticket_created"` or `"delegation_made"`.
- **Pause-aware `providerRouter.complete` wrapper.** Poll `orchestrator.isCompanyPaused(companyId)` on every provider call (default 250ms, test 2ms). M32 must reuse the same wrapper — write-side loops running through a meeting must pause, not fight for slots.
- **`AbortController`-driven stop with canceled-status coercion.** Terminal status is coerced to `'canceled'` regardless of which layer the abort propagated through. Reuse this posture — users will cancel write-side runs more often than read-side.
- **Per-task Loki ledger commits.** Pattern: `<type>(m<N>): M<N> T<N> — <summary>` for the work commit, immediately followed by `chore(loki): M<N> T<N> — commit ledger (<sha>)` updating orchestrator.json + pending.json + CONTINUITY.md. Preserve this for every M32 task.
- **ABI rebuild dance is mandatory before T10 verification.** Node ABI: `cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npx node-gyp rebuild --release` (pnpm rebuild silently no-ops when prebuilt dir is missing for the current Node version — v24 / ABI 137 has no upstream prebuild). Electron ABI: `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar`. Document both in the M32 plan doc's T10 acceptance criteria. **The comma-separated `-w` form is the only syntactically valid invocation** — repeated `-w` flags crash `@electron/rebuild@3.7.2` with `argv.w.split is not a function`.
- **Subagent E2E handoff.** T8 M31 required ONE subagent pass (vs three for M30 T8) because the canned-script surface was additive and the subagent had the M30 `test-classifier.ts` pattern to mirror. Budget ~1 subagent pass for E2E-test work going forward. Coordinator runs git-diff verification + biome spot-check + atomic commit.
- **F10 user-guide style is Overview → Mechanics → Tools → Settings → Control → Privacy → Example → Troubleshooting.** `command-palette.md` (7.6KB, 9 sections) and `agentic-loop.md` (14KB, 11 sections — larger because more moving parts) follow the same shape. Match it for `task-planner.md` in M32 and `copilot.md` in M33.
- **Partial-truth docs are a cut corner.** M26 README claimed 612 tests / 3 E2E / 8 migrations — M31 T9 refreshed to 958 / 8 / 10 plus a whole new Intelligence Layer feature block. When a scoped docs task touches a file, audit surrounding staleness — bundle the fix if it's in-scope, call out in CONTINUITY if it isn't. Same rule applies to `docs/site/index.html` (landing page) which was not touched by T9 and is still Phase-4-stale — flag for M33/M34 design doc work.

### Architectural seams added by M31 (active for M32)

- `@team-x/intelligence/src/loop/` — pure ReAct scheduler subtree. M32 will inject write-side tools into the same `Tool[]` registry. The loop itself does NOT need modification.
- `apps/desktop/src/main/services/agentic-loop-service.ts` — main-process front-door. M32 adds a `buildWriteSideTools` branch or extends `buildTools` to include both read-side and write-side per-company. The `start / stop / getRun / waitForRun` surface remains.
- `apps/desktop/src/main/services/test-agentic-provider.ts` + `test-agentic-tools.ts` — NODE_ENV=test seams. M32 adds new canned entries for write-side prompts.
- `apps/desktop/src/main/services/command-service.ts` — `complex_request` dispatch lives here. M32 does NOT change this line — write-side runs also route through `complex_request` with natural-language prompts.
- Settings keys — M32 adds planner-specific keys (`planner_max_tickets`, `planner_max_depth`, etc. — already in design doc §11). Extend the Agentic Loop subsection, don't create a new one.
- Bus event types — M32 adds `plan.*` / `task.*` / `review.*` (design §4). Append-only contract preserved.

### Environment

- Windows 11 Pro 26200, Node v24.14.1 (ABI 137), Electron 125 (ABI varies), pnpm 9.15.4.
- Dev DB: `%APPDATA%\Team-X\team-x\team-x.sqlite` (migrations 0001–0010 present, system-agent seeded per-company).
- ABI state: current rebuild target is **Electron** (post-E2E). For unit tests, run the Node ABI rebuild command documented in "Patterns to carry forward" above.
- Keychain: OS keychain (`keytar`). No API keys committed.
- Ollama: optional. Tests use `NODE_ENV=test` canned seams — no local LLM required for verification.

## Next Session Startup Checklist (begin M32)

1. Read this CONTINUITY file for M31 rollup context.
2. Read `.loki/state/orchestrator.json` → `currentMilestone: 'M32'`, `previousMilestone: 'M31'`, `baseline.unitTests: 958`, `baseline.e2eSpecs: 8`. `inflight` is empty.
3. Read `.loki/queue/pending.json` → `milestone: 'M32'`, `tasks: []` (empty). `notes` array has the M32 scope sketch + follow-up landing guidance.
4. Write the M32 plan doc at `docs/plans/2026-04-15-team-x-phase-5-m32-task-planner.md` (or similar). Structural template: M31 plan doc. Required sections: Overview, What ships, Invariants preserved, Success criteria, Task breakdown (T0–TN), Acceptance criteria (reiterate the three-tier test seam + ABI rebuild dance + atomic-commit discipline).
5. Early tasks — **F1 and F2 belong at M32 T0 or T1.** Both are small renderer-only fixes that need to land before the write-side loop starts creating tickets, otherwise users will miss live confirmation cards (the root cause in both F1 and F2 is sub-subscription-latency bus events).
6. The write-side tool set (decompose_project / delegate_subtask / review_deliverable) is the headline feature. Each tool needs:
   - Production implementation in `apps/desktop/src/main/services/agentic-tools-write.ts` (or extend `agentic-tools.ts` with a separate exports block).
   - Test seam in `test-agentic-tools.ts` (extend with write-side cases).
   - New bus event types: `plan.created`, `plan.updated`, `task.delegated`, `task.reviewed`, `review.approved`, `review.rejected`.
   - Audit-log visibility (AuditView's event-type filter chips must include the new events).
   - UI surface: palette step-card variants for write-side step kinds (`ticket_created`, `delegation_made`, `review_pending`) with confirmation gates for destructive writes.
7. Guardrails are enforced at the tool level, not the prompt level (design decision D6). Workload scoring is deterministic, not LLM (D7). Keep both invariants when implementing M32.
8. Commit atomically. Same per-task ledger pattern as M30/M31.

## M30 prior patterns (still active, carried from M30 → M31 → M32)

- **Classifier/intent schema** is stable. M32 does not add new intents — all write-side work routes through `complex_request`.
- **Destructive-action gate** applies to write-side tools. `review_deliverable { action: 'reject' }` and `delegate_subtask { overwrite: true }` need `confirmed: true` in the palette before the IPC fires.
- **Command history + audit log** are append-only. Every M32 write-side command execution writes a `command.executed` event AND the appropriate `plan.*` / `task.*` / `review.*` event.
- **`Cmd+K`** remains the only surface. Sidebar / dashboard widgets (M34) will fire `command.execute` too, not a separate write-side IPC.
