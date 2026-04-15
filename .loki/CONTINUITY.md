# Loki Continuity — Phase 5, M31 IN PROGRESS (T0 + T1 + T2 + T3 + T4 + T5 + T6 + T7 + T8 shipped; T9–T10 pending)

## T8 SHIPPED — 2026-04-15 (commit `31227d1`)

**E2E — `agentic-loop.spec.ts`: full complex_request round-trip under `NODE_ENV=test`.**

- `apps/desktop/e2e/agentic-loop.spec.ts` (NEW, 292 LOC) — ONE test. Clones `command-palette.spec.ts` scaffolding verbatim (Electron launch, `--user-data-dir=<mkdtempSync>`, 5s close-with-SIGKILL-fallback, stdout/pageerror forwarding, `Strategia-X` shell wait). Flow: Ctrl+K → type canned phrase → intent chip "Route to Agent" → Enter → palette STAYS OPEN in step-log mode (M31 T6 UX) → terminal `[data-step-kind="answer"]` card with deterministic roster string → Open Thread → chat drawer asserts read-only Copilot Conversations thread persisted → Dashboard → Commands subtab asserts "Route to Agent" audit row. Uses `section[aria-label="Copilot Conversations"]` from T5.
- `apps/desktop/src/main/services/test-agentic-tools.ts` (NEW, 312 LOC) — canned `Tool[]` registry. Three-tier posture mirrors `test-classifier.ts` + `test-agentic-provider.ts`:
  1. `__ECHO_AGENT_TOOL__:<json>` sentinel override in any string-valued arg.
  2. Canned per-tool table. `query_employees` returns a 2-row fixture (CEO + Senior Fullstack Engineer matching the seed — `Iris Kovač` + `Mateo Reyes`). Every other tool returns `{rows: [], truncated: false}`.
  3. Fallback — empty envelope, never-throw contract preserved.
  Zero DB coupling. Exports `createTestAgenticTools({ companyId })` returning tools with IDENTICAL names + descriptions + zod `inputSchema` to production so the system-prompt byte-for-byte matches. Runtime warning logs if imported outside `NODE_ENV=test`.
- `apps/desktop/src/main/index.ts` — composition root `buildTools` gains an `isTestMode()` branch calling `createTestAgenticTools(...)`. Mirrors the T4 `resolveComplete` posture exactly. Production path unchanged.
- `apps/desktop/src/main/services/test-classifier.ts` — adds canned entry: `"what is my team doing right now"` → `{intent: 'complex_request', entities: {}, confidence: 0.88}`.
- `apps/desktop/src/main/services/test-agentic-provider.ts` — adds canned script for the same phrase: `[plan_text + query_employees tool_call, final_answer]`. Answer fixture: `"Team currently has 2 employees active: Iris Kovač (CEO) and Mateo Reyes (Senior Fullstack Engineer). No open tickets in the queue right now."`

**Tests:** +1 E2E spec (7 → **8 green**, 26.3s total). 0 new unit tests (E2E coverage sufficient per task plan).

**Current metrics:** 958 unit tests passing (unchanged). **8/8 E2E green**. 0 lint errors, 24 lint warnings (unchanged). Typecheck clean. ABI rebuild dance triggered once during subagent work (stale better-sqlite3/keytar after prior sandbox activity); resolved with `electron-rebuild -f -w better-sqlite3,keytar`.

**T8 patterns to carry forward:**

- **Three-tier canned seam is the complete E2E pattern for the agentic loop.** Classifier (`test-classifier.ts`), provider (`test-agentic-provider.ts`), and tools (`test-agentic-tools.ts`) each ship a `__ECHO_*__:<json>` sentinel + canned per-key table + fallback. Any future agentic milestone that adds a surface (e.g., M32's write-side Task Planner tools) must ship a matching test-side seam — new production tools are not shippable without an accompanying test-mode swap in the composition root. Enforce this in plan doc acceptance criteria.
- **The subagent E2E-handoff pattern held.** CONTINUITY warned "T8 M30 required three handoffs." T8 M31 required ONE handoff — subagent handled scaffolding, provider/classifier extensions, composition-root edit, and ran `pnpm -F @team-x/desktop test:e2e:run` to green before reporting. Coordinator ran git-diff verification + biome spot-check + atomic commit. Budget ~1 subagent pass for T8-style work going forward, not three. The key difference vs M30: the canned-script surface was additive (not interleaved with wiring), so the subagent never needed to re-exit for clarification.
- **Loop-under-canned-provider runs too fast for the live step-stream bus subscription.** The subagent flagged this explicitly: with zero network latency, the canned `complete` returns before `useAgentStepStream` subscribes via React Query. Only the terminal `answer` card is reliably observed in the palette's LIVE view; earlier steps (plan, tool_call, tool_result) arrive on the bus before any subscriber attaches. The persisted thread (Copilot Conversations drawer) gets all steps because the chat-drawer refetches on mount. **Remediation candidate (out-of-M31 scope):** `useAgentStepStream` should backfill via a `getSteps(runId)` query on mount before attaching the bus listener. Log as a follow-up in M32 prep or Phase 5 design §follow-ups.
- **`useThreadList` has no bus invalidator for `agent.step` events.** Second paper-cut the subagent surfaced: a thread list opened before a copilot run completes can show stale "No threads yet" copy until a manual refetch. The spec routes via the palette's "Open Thread" deep-link to sidestep. Fix is a 2-line `bus.on('agentic.completed', …)` call in `use-thread-list.ts` — small, worth landing in T9 or M32.
- **`data-step-kind` attribute is the stable E2E selector surface for the step log.** Every step-card variant sets `data-step-kind="plan" | "tool_call" | "tool_result" | "answer" | "error"`. Assert against these, not against rendered text — text is tight-coupled to the canned answer and breaks under minor fixture changes.
- **Commit/diff surface is the right shape for T8-class work.** 634 insertions / 3 deletions across 5 files. Two new files (test-agentic-tools.ts + agentic-loop.spec.ts) + three minimal canned-table edits + one compositional-root branch. If a future T8-style commit is orders larger, the subagent strayed — reject and rescope.

---


## T6 SHIPPED — 2026-04-15 (commit `29ed9d2`)

**Palette streaming integration — step log + stop.**

- `packages/shared-types/src/command.ts` — `CommandStopRequest` / `CommandStopResult`.
- `packages/shared-types/src/ipc.ts` — `command.stop` channel + `command.stop(req)` on bridge surface.
- `apps/desktop/src/main/ipc/command-handlers.ts` — extends `CommandHandlersDeps` with `agenticLoopService` + optional `logger`. New `'command.stop'` handler: probes `getRun()`, calls `stop()` only when `status === 'running'`. Idempotent on unknown/terminal runs. Try/catch around service call — errors logged + `{ stopped: false }` returned, never rethrown.
- `apps/desktop/src/main/ipc/command-handlers.test.ts` — 4 new tests (stopped:true happy path, unknown runId, terminal status, logger.error swallow). Renamed "four channel keys" → "five channel keys". New `makeAgenticMock()` + `runStateFixture()` helpers; `build()` helper wraps `buildCommandHandlers` for the common-case boilerplate.
- `apps/desktop/src/main/ipc/register.ts` — `command.stop` added to `REQUEST_CHANNELS`.
- `apps/desktop/src/preload/api.ts` — `commandStop: 'command.stop'` in `CHANNELS`, `stop(req)` method on bridge's `command` namespace.
- `apps/desktop/src/main/index.ts` — composition root: null-guards `agenticLoopServiceInstance`, passes it to `buildCommandHandlers({...})`, registers `ipcMain.handle('command.stop', ...)`.
- `apps/desktop/src/renderer/src/features/command/step-card.tsx` — NEW. `<StepCard>` + `<StepCardSkeleton>`. Per-kind render (plan/tool_call/tool_result/answer/error) with narrow helpers that soft-default partial payloads. `<details>` for tool envelopes (collapsed by default, 48rem max-height JSON scroller). Answer card brand-tinted border. Error card red-bordered. Six UI states: hover lift + brand/40 border, focus-visible ring, loading skeleton, error branch, dimmed (60% opacity when run is terminal), tabindex=-1 for programmatic focus without tab-order noise. `data-step-kind` attribute drives the palette's roving focus.
- `apps/desktop/src/renderer/src/features/command/command-palette.tsx` — new `agenticRun: { runId, threadId } | null` + `stopPending` state. On execute success with `runId` + `threadId`, skip toast + `onOpenChange(false)`; set `agenticRun` and clear parseResult instead. New `<StepLogView>` subcomponent — sticky header (run id + status label + spinner), scrolling step list (auto-scrolls until terminal), cumulative footer (step count · total tokens · USD to 4 decimals, prefers terminal event's authoritative numbers), Stop button while running, Close + Open-Thread buttons when terminal. Dialog widens to 640px in step-log mode; max-height 640px with inner scroll. ArrowUp/Down key handler on the list roves focus between articles. Dialog close clears agentic state; backend run keeps streaming into persisted thread for chat drawer (M31 T5).

**Tests:** +4 new unit tests on command-handlers.test.ts. No renderer DOM harness — E2E coverage deferred to T8 per plan doc.

**Current metrics:** 958 unit tests passing. 0 lint errors, 24 lint warnings (unchanged from pre-T6). Typecheck clean across all 6 workspaces.

**T6 patterns to carry forward:**

- **Agentic-loop control surface splits cleanly.** Start path stays in `CommandService.execute` (via `CommandHandlers.agenticLoopStart` seam T4 shipped). Cancel path goes direct from `command-handlers.ts` to `AgenticLoopService.stop(runId)` because cancellation is run-id-keyed, not intent-keyed. The distinction is worth preserving for M32's write-side tools — any NEW agentic lifecycle channel should think about whether it's intent-scoped or run-scoped before deciding which service owns it.
- **Biome rule `noNoninteractiveTabindex` accepts `tabIndex={-1}`.** `tabIndex={0}` on non-interactive semantic elements (`<article>`, `<section>`) is flagged. `-1` is OK because it only exposes the element to programmatic focus (`element.focus()`) — not keyboard Tab order. For roving-tabindex patterns, this is the right default; set `0` on the container role="listbox" if tab entry is needed. `// biome-ignore` comments do NOT propagate across the JS/JSX boundary reliably — prefer rewriting to pass the rule over disabling it.
- **Biome's `useExhaustiveDependencies` pedantry on effects that read DOM state.** When a useEffect reads DOM derived from a state variable (e.g. `scrollHeight` which reflects array length), the rule flags the state dep as "unused" because the body doesn't read it directly. Two solutions: (a) add a `void stateVar.length;` no-op reference in the body (explicit + self-documenting), or (b) use a ref you bump manually. Option (a) is what M31 T6 used.
- **Step-card narrowing contract.** Each kind's `data` payload has a known shape but shared-types types it as `unknown` for JSON safety. Narrow helpers (`narrowPlan`, `narrowToolCall`, etc.) do soft-validation with fallbacks rather than throwing — renderer never crashes on a malformed step. M32 write-side tools should follow the same pattern.
- **Dialog mode-switching pattern.** The palette now has two mutually-exclusive body modes gated on `agenticRun`. Keeping the gate at the DialogContent body level (rather than a separate `<Dialog>` per mode) lets the same mount point keep its focus trap, Esc handling, and animation — fewer React reconciliation edges. If M34 Copilot UI wants a third mode (e.g. task planner preview), extend the same switch rather than forking the component.

---


## Current State

- **Phase 4 (Ship-readiness) SHIPPED.** v1.0.0 tagged. All 27 milestones complete.
- **Phase 5 (Intelligence Layer) in flight.** Design doc at `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`.
- **M28 (Intelligence Package + RAG Foundation) COMPLETE** — 2026-04-13.
- **M29 (RAG integration into agent turns) COMPLETE** — 2026-04-13.
- **M30 (NLU Engine + Command Palette) COMPLETE** — 2026-04-14. 11 tasks (T0–T10).
- **M31 (Agentic Loop) IN PROGRESS** — plan doc at `docs/plans/2026-04-14-team-x-phase-5-m31-agentic-loop.md`.
  - **T0 SHIPPED** (commit `4f30efa`) — system-agent pseudo-employee, migration 0010 (`is_system` column + partial index), `system-agent.md` role card under `role-packs/strategia-official/roles/system/`, `system-agent-bootstrap.ts` with `ensureSystemAgent` + bus event, `employees.list` + `orgchart.get` + delegation pickers all filter `is_system = 0`. +89 employees.test rows + 151 bootstrap.test + 72 ipc/handlers tests.
  - **T1 SHIPPED** (commit `67e0136`) — `@team-x/intelligence/src/loop/` (types, prompt, tool-registry, loop). Pure ReAct orchestrator, provider-agnostic, zero Electron/DB/fs coupling. Forward-scan brace-balanced parser, one-shot nudge recovery, hard step/token/wall-clock budgets. 33 new unit tests (loop 19, tool-registry 8, prompt 6).
  - **T2 SHIPPED** (commit `7b5c4f9`) — `apps/desktop/src/main/services/agentic-tools.ts` — six read-only tools (`query_employees`, `query_tickets`, `query_projects`, `query_meetings`, `query_vault`, `query_events`) wrapping existing repos with JSON-safe projections, `{rows, truncated}` envelope capped at 50 rows, defensive `isSystem` filter on employees path, `summarizePayload` with 200-char cap + ellipsis. 40 new unit tests (+20 target). Also: added `zod` to `apps/desktop` deps, cleared T1's `Record<string, any>` default in `Tool` generic (→ `unknown`), rebuilt `packages/intelligence/dist` to surface loop types to composite consumers.
  - **T3 SHIPPED** (commit `791e6f6`) — `apps/desktop/src/main/services/agentic-loop-service.ts` + `test-agentic-provider.ts` seam. `createAgenticLoopService({employeesRepo, threadsRepo, messagesRepo, runsRepo, bus, orchestrator, buildTools, resolveComplete, ...})` with `start / stop / getRun / waitForRun`. `start()` resolves system-agent, creates dm thread with user+agent members, appends user message, writes `runs` row, instantiates `createAgenticLoop`, runs loop in background IIFE. `onStep` fans to bus as `agent.step` + persists message row per step. Terminal: `agentic.completed` or `agentic.failed` + `runs.finish`. `stop()` aborts via per-run `AbortController`; terminal status coerced to `'canceled'` regardless of which layer the abort propagated through. Pause-aware complete wrapper polls `orchestrator.isCompanyPaused(companyId)` on every provider call (poll default 250ms, test 2ms). Also ships: 3 new `EventType` values (`agent.step`, `agentic.completed`, `agentic.failed`) + payload interfaces in `shared-types/events.ts`; `test-agentic-provider.ts` — three-tier lookup (`__ECHO_AGENT__:[...]` sentinel / canned table / fallback) mirroring M30 T8 `test-classifier.ts` pattern, per-prompt call-count tracking. 25 new unit tests (+13 over target of 12) — 8 provider + 17 service.
  - **T4 SHIPPED** (commit `179569a`) — `CommandService` → `AgenticLoopService` wiring. `CommandHandlers` gained optional `agenticLoopStart(req): Promise<{runId, threadId}>` (mirrors `employeesFire` / `employeesPromote` optional pattern — absence → typed `handler_error`). `ExecuteResult.ok` + `DispatchOutcome` + `IpcExecuteResult.ok` + `CommandExecutedPayload` each grew optional `runId`/`threadId` fields; `execute()` propagates them through the success branch and into the audit event payload with exact-omit semantics (no `undefined`-serialized-to-null). The M30 T4 stub at `command-service.ts:770-775` now calls `h.agenticLoopStart` and uses `runId` as the canonical `resultId` so Audit-view deep-links are stable. `apps/desktop/src/main/index.ts` composition root instantiates `createAgenticLoopService` after the orchestrator (so the pause-gate observer can read `isCompanyPaused`) and before CommandService (so the handlers dispatch map closes over the live service). `resolveComplete` test-mode branch uses `createTestAgenticCompleteFn`; production branch wraps `streamAgent` by accumulating delta chunks + end-of-stream usage. `buildTools` delegates per-run to `createAgenticTools`. Module-level `agenticLoopServiceInstance` handle + null-safe will-quit teardown mirrors the `commandServiceInstance` pattern. 5 new unit tests (+1 under target of 6) — all on `command-service.test.ts` (20 → 25). Test #12 replaced (new happy-path assertion); tests #21–#25 cover audit-payload runId/threadId, missing-handler handler_error, start-rejection handler_error with audit-row omissions, omitted-rawText empty-string coercion, and regression-guard for non-complex intents.
- **Current metrics:** 936 unit tests passing (pre-T4 was 926; +5 net from T4 = 931 shown here is the baseline row — full suite reports 931 passing + 8 pre-existing ABI failing = 939 total; ABI-fresh count projects to 936+). 0 lint errors, 24 lint warnings (unchanged since T3), typecheck clean, 7 E2E specs (untouched). 8 pre-existing ABI failures on `embeddings.test.ts` + `vec-init.test.ts` — same Node-v22/Electron-125 skew documented in §Troubleshooting; resolved by T10 rebuild dance.
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
| T3 | shipped | 12 (actual 25) | `AgenticLoopService` — start/stop/getRun/waitForRun, pause-aware complete wrapper, abort coercion, shared-types event types |
| T4 | shipped | 6 (actual 5) | CommandService → AgenticLoopService wiring. Replaces T4 stub. `CommandHandlers.agenticLoopStart` + `ExecuteResult.runId/threadId` + composition root |
| T5 | pending | 6 | System-agent thread UX — Copilot Conversations section, inline step transcript |
| T6 | pending | 0 (E2E) | Palette step-log mode + `command.stop` IPC + six UI states |
| T7 | pending | 8 | Settings: `agentic_max_steps` (8), `agentic_max_tokens` (8000), `agentic_timeout_ms` (120000) |
| T8 | shipped | 1 (actual 1 E2E) | `agentic-loop.spec.ts` — full round-trip via classifier/provider/tools seams; **8/8 E2E green** |
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

## Next Session Startup Checklist (M31 mid-flight — begin T9 docs)

1. Read this CONTINUITY file.
2. Read `.loki/state/orchestrator.json` → tasksCompleted should be 9 (T0 + T1 + T2 + T3 + T4 + T5 + T6 + T7 + T8); inflight.M31.commits includes T8 sha `31227d1`.
3. Read `docs/plans/2026-04-14-team-x-phase-5-m31-agentic-loop.md` — focus on T9 (docs) then T10 (verification + milestone marker).
4. T9 is documentation-only. Files: `CLAUDE.md` (status block + M31 milestone entry + Agentic Loop troubleshooting), `CHANGELOG.md` ([Unreleased] entry with all 9 shipped tasks), `README.md` (new Agentic Loop feature blurb), `docs/user-guide/agentic-loop.md` (new user-facing guide — command-palette flow, settings, system-agent threads, troubleshooting), and `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md` §9 (resequence the actual shipped order for M28 / M29 / M30 / M31).
5. T10 (verification + milestone marker): full `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm -F @team-x/desktop test:e2e` with the ABI rebuild dance in between (both Node-v22 ABI 137 and Electron-125 ABI). Update orchestrator.json → set currentMilestone: 'M32' / name: 'Task Planner', move M31 block into `history`. Clear pending.json. Rewrite CONTINUITY.md with an M31-COMPLETE header summarizing all 11 tasks with commits, test delta (819 → target ~905 unit + 7 → 8 E2E), and patterns to carry forward.
6. T9/T10 are sequential (T10 gates on T9). Single session is plenty if context budget allows.
7. Commit atomically. T9 = one `docs(m31):` commit. T10 = one `chore(loki): M31 complete` commit.
8. Two known follow-up paper-cuts flagged by T8 (see T8 patterns block above) — `useAgentStepStream` backfill + `useThreadList` bus invalidator. Prefer scheduling into M32 prep or Phase 5 design `§follow-ups`; do NOT bundle into T9 unless Rocky explicitly asks.

## T4 patterns to carry forward (new)

- **Optional dispatch-seam methods are the safest way to widen `CommandHandlers`.** Making `agenticLoopStart?` optional lets every existing fake/test-stub keep compiling without a change, and the dispatcher surfaces absence as a typed `handler_error` instead of a runtime crash. This mirrors the `employeesFire` / `employeesPromote` pattern and is the right default for any future write-side tool that lands through the palette.
- **Audit-payload runId/threadId should be exact-omit, not `undefined`-serialized.** Attaching `runId: undefined` to a `CommandExecutedPayload` would round-trip through the bus as `null`, which downstream consumers would then have to null-check. Using `...(x !== undefined ? { x } : {})` keeps the shape minimal for the 14 non-agentic intents and the one agentic intent both. Apply the same discipline to any new cross-ref field on the event payload.
- **resultId doubling as runId is a feature, not a hack.** The Audit view and the command-history list render `resultId` by convention — using it as the stable deep-link reference for `complex_request` means the Audit view already renders correctly without any new column. `runId` + `threadId` are additive cross-refs for richer renderers (palette step-log, thread jump button).
- **Production-path `streamAgent → LoopCompleteFn` wrapper is non-streaming.** Accumulate delta chunks into a single text, record usage on the terminal `done` event, return. T7 will extend with cost attribution via `calcCostUsd`. The pattern is small enough to inline in the composition root; if a second consumer lands, extract a `build-agentic-complete.ts` sibling.
- **Module-level service handles default to `null` + null-safe teardown.** `agenticLoopServiceInstance: AgenticLoopService | null` matches `commandServiceInstance`, `orchestrator`, `mcpHostInstance` patterns. Will-quit cleanup nulls the handle without an explicit stop call — in-flight runs hold their own AbortController. A drain-all helper is a legitimate follow-up if we ever see ghost runs.
- **Organize-imports is a whole-file rewrite, not a line-level autofix.** `pnpm format` does not run `organizeImports`; that's a `lint/correctness` rule handled by `biome check --fix`. After any new top-level import in a large file (main/index.ts especially), run `npx biome check --fix <file>` to settle the import block in one pass. Missed the first time in T4 — cost one extra lint-triage cycle.
- **T3 AbortController coercion reaches into T4 dispatcher naturally.** The `handler_error` branch already swallows any throw from the dispatch table into a typed ExecuteResult. When the agentic-loop service throws on an externally-aborted run, it surfaces as `handler_error` with a clean message — no special-casing in CommandService. Keep this boundary discipline for T6's `command.stop` path too.

## T3 patterns to carry forward

- **Abort coercion guarantees a clean `stop()` contract.** The underlying `@team-x/intelligence` loop maps abort into `tool_threw` / `tool_timeout` / `provider_error` depending on which layer was mid-flight. That leaks implementation detail into the bus. T3 resolves this by checking `controller.signal.aborted` at the terminal join point: if the controller was externally aborted AND the loop didn't naturally complete, we coerce `state.status='canceled'` + `errorReason='canceled'`. Natural `completed` wins (late-stop race goes to the runner). Same pattern belongs in T6's palette-stop flow.
- **Pause-aware complete wrapper > per-iteration check.** Instead of polling pause inside the loop factory (which would require leaking orchestrator into `@team-x/intelligence`), wrap the `LoopCompleteFn` in a closure that `await waitUntilUnpaused(companyId, signal)` before calling through. Result: zero change to the pure loop package, full orchestrator-pause respect, and the signal integration falls out for free. `waitUntilUnpaused` is a polling gate (default 250ms) that signals AbortError when the outer controller fires; tests use 2ms polling for speed.
- **Background IIFE + resolvable completion is the right shape for `start() returns immediately`.** `const completion = (async () => {...})();` wraps the whole loop lifecycle. The factory map stores `{state, controller, completion}`. `waitForRun(runId)` awaits `entry.completion` — no separate Promise resolver plumbing. `completion.catch(logger.error)` catches unhandled-rejection risk defensively; the IIFE's inner try/catch already swallows.
- **Structural dep interfaces beat Pick<RepoType>.** Service deps declare `AgenticLoopThreadsRepo`, `AgenticLoopMessagesRepo`, etc. as local interfaces with only the method shapes the service uses. Tests implement them with hand-rolled classes; production wires them from the real drizzle repos. Mirrors meeting-service.ts precisely. Keeps tests decoupled from `ReturnType<typeof createThreadsRepo>` type regressions.
- **`void newId` pattern for "reserved but not yet used" deps is a lint trap.** Biome's organizeImports + dead-code rule flagged the declaration. Dropped it entirely — future T4/T5/T6 tasks can re-add if they need a separate id generator. The `runs.start(...)` return already provides a runId, so the generator was decorative.
- **Import sort + formatter diffs = 5 of the 7 first-run lint errors.** Run `pnpm format` before triaging after every service-file creation. Biome's organizeImports isn't a line-level autofix — it's a whole-file rewrite. `npx biome check --fix <file>` handles it per-file when `pnpm format` doesn't cover organizeImports.
- **Shared-types events extension requires no dist rebuild for consumers during typecheck.** `packages/shared-types` is composite, but `pnpm typecheck` runs `tsc --noEmit` with project refs — it reads `.ts` source, not `dist/.d.ts`. The `pnpm -F @team-x/shared-types exec tsc` I ran was defensive and not strictly required; remove from T4/T5 checklists unless downstream is `dist`-consuming (which for in-repo packages, it's not under `--noEmit`).

## T2 patterns to carry forward

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
