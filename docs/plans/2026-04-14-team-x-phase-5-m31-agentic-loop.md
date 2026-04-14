# M31: Agentic Loop — Implementation Plan

**Phase 5 — Intelligence Layer | Milestone 31**
**Plan date:** 2026-04-14
**Previous milestone:** M30 (NLU Engine + Command Palette) — complete
**Next milestone:** M32 (Task Planner — decompose/delegate/review tools)
**Design reference:** `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md` §4 (Complex → Copilot Agent branch) + §7 (Task Planner context)

---

## Overview

M30 gave Rocky a deterministic command surface. Every structured intent — hire, fire, assign, search, meet — now resolves to an existing IPC call with a confirmation gate. The fourteen structured intents are done.

The fifteenth intent is not. `complex_request` is what the classifier returns when a user's text is conversational, multi-hop, or analytical — *"why is the frontend team behind?"*, *"summarize what the CEO did this week"*, *"who should I assign the auth bug to?"* M30 T4 left that path as a stub: `{ summary: 'Escalated to agentic loop (M31).' }` with a `// TODO(M31): wire d.handlers.agenticLoopStart(...)` marker.

M31 replaces that stub with a real **agentic loop**: a ReAct-style reasoning engine that takes a free-form prompt, plans, calls read-only org tools (`query_employees`, `query_tickets`, `query_projects`, `query_vault`, `query_events`), observes, and iterates until it produces a grounded answer — all inside a hard budget of steps / tokens / wall time. The loop runs on a special `system-agent` pseudo-employee that is seeded per company, hidden from the employee list + org chart, and reused across every `complex_request`.

M31 ships the **read-side** capabilities only. The write-side (decompose → delegate → review, with workload scoring, escalation, guardrails, and new `plan.*` / `task.*` / `review.*` event types) is M32. This split keeps the agentic-loop core testable in isolation, and lets the palette surface useful answers *now* without also needing to approve every ticket the agent might want to create.

### What ships

- **`@team-x/intelligence/loop`** — pure package subtree: ReAct scheduler, tool registry, budget enforcement, step/plan/tool/observation/answer stream contract. No Electron, no DB, no orchestrator coupling. All deps injected.
- **Read-side agentic tools** — `query_employees`, `query_tickets`, `query_projects`, `query_meetings`, `query_vault`, `query_events`. Each wraps an existing repo with a JSON-safe projection. Level-aware (system-agent gets all; future human-employee use will be gated).
- **`AgenticLoopService`** in `apps/desktop/src/main/services/agentic-loop-service.ts` — main-process orchestrator front-door. Accepts `{ companyId, userText }`, runs the loop, streams `agent.step` events, writes a persisted thread on the `system-agent`, emits `agentic.completed` on finish, honors orchestrator pause (meetings).
- **System-agent seed** — new `role-packs/strategia-official/roles/system-agent.md` role card, plus `is_system` column on `employees` (migration 0010), plus `ensureSystemAgent(companyId)` bootstrap in seeding so every company has exactly one. Hidden from `employees.list`, org chart, hire dialog, delegation pickers.
- **CommandService → loop handoff** — `agenticLoopStart` handler on `CommandHandlers`, stub at line 770-775 of `command-service.ts` replaced with real dispatch. Palette receives `{ threadId, runId }` and subscribes to the live step stream.
- **Palette streaming UI** — step log panel renders `agent.step` events as cards (plan / tool call / tool result / answer / error), with provider+token footer per step, a final grounded answer block, and a Cancel button that fires `agenticLoopStop`.
- **Settings: agentic loop controls** — `agentic_max_steps` (default 8), `agentic_max_tokens` (default 8000), `agentic_timeout_ms` (default 120000). New "Agentic Loop" subsection in Settings → Runtime.
- **E2E spec `agentic-loop.spec.ts`** — canned classifier returns `complex_request`; canned provider streams `plan → tool_call(query_employees) → tool_result → answer`; verify palette log, persisted thread, `agentic.completed` event, audit row.

### Invariants preserved

1. **Renderer is a pure view.** Palette calls `command.execute` + subscribes to `agent.step` events. No LLM, no tool execution, no DB in the renderer.
2. **Orchestrator is the only scheduler.** `AgenticLoopService` respects `isCompanyPaused()` — if a meeting is active, the loop queues and resumes with the orchestrator. No independent dispatch.
3. **MCP Host stays a singleton.** Agentic tools are built-in (main-process closures over repos), NOT MCP servers. No new MCP connections.
4. **Provider router is the only LLM touch-point.** The loop calls `providerRouter.runStream()` exclusively. Privacy tier + concurrency caps + cost tracking flow through unchanged.
5. **Storage is SQLite + filesystem vault.** Thread messages persist via existing `messages` repo. No new storage layer. `runs` telemetry extends for agentic invocations.
6. **Events table is append-only.** New event types (`agent.step`, `agentic.completed`, `agentic.failed`) are appended. Renderer subscribes for live UX.
7. **Zero phone-home.** The loop runs on whatever provider the company has configured. Default path is local Ollama.
8. **Secrets in OS keychain.** No new secret storage.
9. **Role-pack overrides preserved.** `system-agent.md` ships as a role card; user customization rules apply (frontmatter overrides, body prompt additions).
10. **Runtime strategy adaptive.** Loop respects runtime slot counts (Hybrid / Always-On / Lean) at dispatch.
11. **IPC mutations emit bus events.** `agenticLoopStart` persists the thread + loop run, then emits `agent.step` / `agentic.completed`. Renderer invalidates via bus subscription, not just the IPC return.

### Success criteria

- `"why is the frontend team behind?"` typed into Cmd+K returns a grounded multi-paragraph answer citing specific tickets, employees, and recent events — not a hallucinated summary.
- Loop terminates deterministically: hits the answer OR a budget cap. Never runs unbounded.
- Every loop run produces a persisted thread on `system-agent`, addressable in the Threads sidebar after the palette closes.
- Every loop run produces exactly one `agentic.completed` (or `agentic.failed`) bus event, audit-loggable.
- `agentic-loop.spec.ts` green. `pnpm -r typecheck` clean across all six packages. Biome lint: 0 errors, ≤ 75 warnings (maintains M30 posture).
- Unit test baseline: 819 → ~905 (+~85). E2E: 7 specs → 8 specs.
- `NODE_ENV=test` seam activated: canned provider emits a scripted plan + tool call + answer; canned tool registry returns scripted JSON. No Ollama, no network.

---

## Task breakdown

### T0: System-agent seed + `is_system` column (migration 0010)

**Files:**
- `apps/desktop/src/main/db/schema.ts` — add `isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false)` to `employees`.
- `apps/desktop/src/main/db/migrations/0010_employee_is_system.sql` — `ALTER TABLE employees ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0;` + partial index `CREATE INDEX idx_employees_system ON employees(company_id) WHERE is_system = 1;`
- `role-packs/strategia-official/roles/system-agent.md` — new role card. `level: system`, `preferred_providers: [...]` mirrors the company default, `tools_allowed: ['query_employees', 'query_tickets', 'query_projects', 'query_meetings', 'query_vault', 'query_events']`, `tools_denied: []`. Body: identity ("Team-X Copilot"), mission (ground answers in org state, never fabricate), escalation rules (defer to Rocky when evidence is thin).
- `apps/desktop/src/main/services/system-agent-bootstrap.ts` — `ensureSystemAgent(db, companyId): EmployeeId`. Idempotent: SELECT first, INSERT on miss. Called from `seedIfEmpty()` and on every `companies.create`.
- `apps/desktop/src/main/db/repos/employees.ts` — extend `list()`, `listByLevel()`, and org-chart queries with `WHERE is_system = 0`. Add `getSystemAgent(companyId)`.

**Why:** Every `complex_request` thread belongs to *somebody*. The system-agent is that somebody. Hiding it from the employee list + org chart keeps the user-facing UX clean (55 F10 roles, not 56). The `is_system` flag is explicit and indexable — better than a magic role_id string check.

**Tests (~8):** migration round-trip, `ensureSystemAgent` idempotency, `employees.list` excludes system, `orgchart.get` excludes system, hire dialog role catalog excludes system, `employees.fire` refuses to fire a system agent.

### T1: Agentic loop core — `@team-x/intelligence/src/loop/`

**Files:**
- `packages/intelligence/src/loop/types.ts` — `type LoopStep = { kind: 'plan' | 'tool_call' | 'tool_result' | 'answer' | 'error'; ... }`; `type LoopRun = { runId, steps: LoopStep[], status, budget }`; `type Tool = { name, description, schema (zod), execute: (args) => Promise<unknown> }`; `type LoopDeps = { providerRouter, tools: Tool[], model, maxSteps, maxTokens, timeoutMs, systemPrompt? }`.
- `packages/intelligence/src/loop/tool-registry.ts` — `createToolRegistry(tools)`, `resolveTool(name)`, schema validation via zod, tool-call timeout, per-tool error wrapping.
- `packages/intelligence/src/loop/loop.ts` — `createAgenticLoop(deps)` factory. Returns `{ run(userText, { onStep }) }`. Implementation: ReAct transcript (system + user + (assistant_plan + tool_call + tool_result)*). Streaming: yields steps as they land. Termination: `final_answer` marker in the assistant output, or budget exhausted (emit `error` step, surface partial state).
- `packages/intelligence/src/loop/prompt.ts` — canonical system prompt builder: "You have access to the following tools. Think step by step. Emit `{"action": "<tool_name>", "args": {...}}` to call a tool, or `{"action": "final_answer", "answer": "..."}` to finish."
- `packages/intelligence/src/loop/loop.test.ts` — unit tests against a canned providerRouter double + canned tool registry. 15+ cases.
- `packages/intelligence/src/index.ts` — re-export loop symbols.

**Hard rules:**
- Loop is pure. No Electron, no DB, no `fs`. All deps injected.
- Budget enforcement is non-negotiable: step cap, token cap, wall-clock timeout. Hitting any of the three emits an `error` step with `reason: 'budget'` and returns the run with `status: 'budget_exhausted'`.
- Tool-call JSON parsing is strict. A malformed tool call triggers a one-shot nudge prompt ("Your last message was not valid JSON..."); second failure terminates with `error: 'tool_call_invalid'`.
- Every step carries `{ tokensIn, tokensOut, costUsd, provider, model }` for telemetry.

**Tests (~18):** plan-then-answer, plan-then-tool-then-answer, multi-tool chain, budget step cap, budget token cap, budget timeout, malformed tool call recovery, malformed tool call terminal failure, unknown tool name, tool throws, tool timeout, empty tools list, custom system prompt, onStep fires in order, run returns on cancel.

### T2: Read-side agentic tools — `apps/desktop/src/main/services/agentic-tools.ts`

**Files:**
- `apps/desktop/src/main/services/agentic-tools.ts` — `createAgenticTools(deps: { db, vaultRepo, employeesRepo, ticketsRepo, projectsRepo, meetingsRepo, auditRepo }): Tool[]`. Each tool: zod schema, 2-sentence description, closure over the repo, JSON-safe projection, max 50 rows returned per call (truncation marker).
- `apps/desktop/src/main/services/agentic-tools.test.ts` — mock repos, verify JSON projection shape, filter correctness, truncation marker, denial-of-write (tools never mutate).

**Tool set:**
| Tool | Args | Returns |
|------|------|---------|
| `query_employees` | `{ level?, managerId?, searchName? }` | `[{ id, name, roleName, level, managerId, status }]` |
| `query_tickets` | `{ status?, assigneeId?, priority?, projectId?, limit? }` | `[{ id, title, status, priority, assignee, createdAt, updatedAt }]` |
| `query_projects` | `{ status?, limit? }` | `[{ id, name, description, status, ticketCount, progressPercent }]` |
| `query_meetings` | `{ since?, limit? }` | `[{ id, title, attendeeCount, status, startedAt, endedAt }]` |
| `query_vault` | `{ query, limit? }` | `[{ id, name, mimeType, relevanceScore }]` |
| `query_events` | `{ type?, since?, limit? }` | `[{ id, type, actorName, payloadSummary, createdAt }]` |

**Hard rules:**
- Tools are READ-ONLY. No repo method that mutates is allowed inside any tool implementation. ESLint/biome rule or code review guard.
- Every tool returns structured JSON, not prose. The loop's LLM consumes JSON and cites specifics.
- `query_vault` goes through the vault's FTS5 path; if FTS5 is unavailable (best-effort init failed), degrade to LIKE.
- Payload summaries in `query_events` truncate to 200 chars with `…`.

**Tests (~20):** per-tool happy path (6), filter correctness (6), truncation marker on >50 results, read-only enforcement, JSON serializability, FTS5 fallback, error propagation.

### T3: `AgenticLoopService` — main-process orchestrator front-door

**Files:**
- `apps/desktop/src/main/services/agentic-loop-service.ts` — `createAgenticLoopService(deps)`. Methods: `start({ companyId, userText }): { runId, threadId }`, `stop(runId)`, `getRun(runId)`. Internal: resolves system-agent, creates a thread on it (M11 messaging infrastructure), instantiates the loop with resolved `providerRouter.runStream` + agentic tools for the company, subscribes `onStep` to write step events to the bus and persist transcript rows, emits `agentic.completed` or `agentic.failed` terminally, respects `orchestrator.isCompanyPaused(companyId)` (if paused during a meeting, queue and resume).
- `apps/desktop/src/main/services/agentic-loop-service.test.ts` — mock providerRouter + tools + bus. 12+ cases.
- `apps/desktop/src/main/services/test-agentic-provider.ts` — `NODE_ENV=test` seam. Scripted plan → tool_call → answer sequence, mirrors the `test-classifier.ts` pattern from M30 T8.

**Hard rules:**
- `start()` returns immediately with `{ runId, threadId }`; the loop runs in background. Renderer subscribes to `agent.step` via the event bus.
- `stop(runId)` aborts the loop mid-step (AbortController); next step emits `{ kind: 'error', reason: 'canceled' }` then terminates.
- Orchestrator pause: if paused at `start()`, queue; if paused mid-run, the next `providerRouter.runStream` call will observe the pause gate and block — document this path.
- Settings are read per-call from the settings repo: `agentic_max_steps`, `agentic_max_tokens`, `agentic_timeout_ms`.
- Every run writes a `runs` row with kind `'agentic'` for the telemetry dashboard.

**Tests (~12):** happy path, stop mid-run, budget exhaustion, tool-call fanout, orchestrator-paused at start, orchestrator-paused mid-run, provider error, malformed tool call recovery, settings override, thread persistence, `runs` row written, completed event shape.

### T4: Wire CommandService → AgenticLoopService

**Files:**
- `apps/desktop/src/main/services/command-service.ts` — extend `CommandHandlers` interface with `agenticLoopStart: (args: { companyId, text }) => Promise<{ runId, threadId }>`. Replace the stub at lines 770–775 with a real call to `d.handlers.agenticLoopStart(...)`. Update the `ExecuteResult` summary to include `threadId` + `runId` so the palette can subscribe.
- `apps/desktop/src/main/ipc/command-handlers.ts` — wire `agenticLoopStart` to the `AgenticLoopService.start()` in the IPC deps construction.
- `apps/desktop/src/main/index.ts` — instantiate `AgenticLoopService` during bootstrap, wire into `CommandService` deps.
- `packages/shared-types/src/command.ts` — extend `ExecuteResult` with the optional `{ runId?, threadId? }` return fields.

**Hard rules:**
- `agenticLoopStart` never blocks on completion. It returns `{ runId, threadId }` within a few hundred ms.
- The `Expect<Equal<IntentName, IpcIntentName>>` drift guard from M30 T5 stays green.
- The existing `command.executed` audit event fires on dispatch — payload gains `{ runId, threadId }` for traceability. Dispatch-complete vs loop-complete are distinct events (the audit record captures that the command was accepted; `agentic.completed` captures that the loop finished).

**Tests (~6):** dispatch returns runId+threadId, audit event fires, interface drift guard compiles, `ExecuteResult` type export round-trip, error path emits `agentic.failed`, stop from palette cancels.

### T5: System-agent thread UX

**Files:**
- `apps/desktop/src/renderer/src/features/chat/thread-list.tsx` — add a `system` section at the top of the thread list ("Copilot Conversations"), distinct from employee threads. Robot icon (`Sparkles` from lucide).
- `apps/desktop/src/renderer/src/features/chat/thread-detail.tsx` — recognize system-agent threads, render a "Copilot" header pill, render `agent.step` transcript cards inline alongside messages (step cards expand/collapse on click).
- `apps/desktop/src/renderer/src/hooks/use-agent-step-stream.ts` — subscribe to `agent.step` events filtered by runId, write into local React state, auto-scroll.
- `apps/desktop/src/renderer/src/features/chat/system-agent-badge.tsx` — shared visual component (dark-red badge, spark icon).

**Hard rules:**
- System-agent threads are never editable by the user (no compose box). Replies only come from the loop.
- The thread persists forever unless the user explicitly deletes it. A new `complex_request` always creates a *new* thread — threads are per-query, not per-user.
- Once the loop completes, the thread header shows the final answer + the step log below. When loop is in-flight, the step cards stream live.

**Tests (~6):** thread-list renders system section, detail renders step cards, step stream hook cleans up subscription on unmount, badge visual contrast (AA), empty state, error state.

### T6: Palette streaming integration

**Files:**
- `apps/desktop/src/renderer/src/features/command/command-palette.tsx` — post-execute, if `ExecuteResult.runId` is present, switch the palette body from "summary" to "step log" mode. Render step cards as they arrive via `use-agent-step-stream`. Show a "Stop" button that calls a new `command.stop` IPC (wires to `AgenticLoopService.stop`). On `agentic.completed`, show the final answer + a "Open Thread" button that closes the palette and navigates to the thread.
- `apps/desktop/src/renderer/src/features/command/step-card.tsx` — reusable presentation component for each step kind (plan / tool_call / tool_result / answer / error). Plan/answer = prose; tool_call/tool_result = collapsible JSON.
- `packages/shared-types/src/ipc.ts` — add `command.stop` channel.
- `apps/desktop/src/main/ipc/command-handlers.ts` — `command.stop` → `AgenticLoopService.stop(runId)`.

**Hard rules:**
- All six UI states implemented (per global UI standards): hover (cards lift), focus (keyboard-accessible step navigation with ArrowUp/Down), loading (skeleton per step), error (red border + reason), empty (pre-first-step placeholder), disabled (stop button disables after terminal step).
- Cost footer shows cumulative tokens + USD across all steps, live-updating.
- Palette dialog height: max 640px; step log scroll container inside.

**Tests:** covered by E2E in T8; no new unit tests (renderer has no harness, per M30 notes).

### T7: Settings — agentic loop controls

**Files:**
- `apps/desktop/src/main/db/repos/settings.ts` — extend `seedDefaults()` with three new keys: `agentic_max_steps` (8), `agentic_max_tokens` (8000), `agentic_timeout_ms` (120000).
- `apps/desktop/src/renderer/src/features/settings/agentic-section.tsx` — new subsection in Settings → Runtime, after the Concurrency section. Three inputs (number + label + helper text). Save button writes via `settings.setConcurrency`-style API (extend if needed).
- `apps/desktop/src/main/ipc/settings-handlers.ts` — `settings.getAgentic` / `settings.setAgentic` channels. Typed via shared-types.
- `packages/shared-types/src/ipc.ts` — add two channels + payload types.

**Tests (~8):** default seeds, setAgentic happy path, clamp negative values, clamp zero, clamp above max (steps≤32, tokens≤64000, timeout≤600000), getAgentic reflects set, concurrency independence from caps.

### T8: E2E spec — `agentic-loop.spec.ts`

**Files:**
- `apps/desktop/e2e/agentic-loop.spec.ts` — full round-trip:
  1. Boot Electron with `NODE_ENV=test` (test-mode classifier + test-mode provider + test-mode agentic provider active).
  2. Open Cmd+K, type `"why is the frontend team behind?"`.
  3. Expect intent chip `complex_request`, confidence bar visible.
  4. Press Enter to execute.
  5. Wait for step card count ≥ 3: `plan → tool_call(query_employees) → tool_result → tool_call(query_tickets) → tool_result → answer`.
  6. Final answer card visible with canned text (substring match on a fixture).
  7. "Open Thread" button navigates to the persisted thread.
  8. Thread view renders the full step transcript + final answer.
  9. AuditView shows a `command.executed` row for the invocation AND an `agentic.completed` row for the loop.
- `apps/desktop/src/main/services/test-agentic-provider.ts` — scripted sequence keyed on a prompt substring, returns the fixture described in step 5.
- `apps/desktop/src/main/services/test-agentic-tools.ts` — canned tool registry for the test provider, returns deterministic employee/ticket fixtures.

**Hard rules:**
- Test seam gated on `NODE_ENV === 'test'`; production path untouched.
- Spec runs under the existing `test:e2e` script and passes on the first attempt.
- Spec cleans up its thread on teardown (Playwright `afterEach`).

**Tests:** 1 new E2E spec. Baseline: 7 → 8.

### T9: Documentation

**Files:**
- `CLAUDE.md` — Status line updated (M31 complete, Phase 5 M32 next). New IPC table rows (`command.stop`, `settings.getAgentic`, `settings.setAgentic`). New event types (`agent.step`, `agentic.completed`, `agentic.failed`). New settings keys table. Troubleshooting entries: "Agentic loop hangs on budget cap", "System-agent missing from company", "Thread not appearing after complex_request".
- `CHANGELOG.md` — `[Unreleased]` section gains M31 entries under Added (agentic loop core, system-agent, 6 read-side tools, palette step log, settings controls, E2E spec) and Changed (command-service complex_request dispatch now real).
- `README.md` — Features table gains "Copilot: ask free-form questions grounded in your company's state". Phase 5 status line updated.
- `docs/user-guide/agentic-loop.md` — NEW. Sections: What it is, When to use it (vs structured commands), How the loop works (plan → tools → observe → answer), Budget caps, Privacy (runs on your configured provider), Example prompts (10 examples), Troubleshooting.
- `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md` — §9 milestone table updated to reflect the actual shipped sequence (M30 = NLU + Palette combined, M31 = Agentic Loop, M32 = Task Planner, M33 = Copilot Service, M34 = Copilot UI, M35 = Demo + Hardening).

**Tests:** 0 code tests. Docs smoke-read only.

### T10: Verification + milestone marker

**Steps:**
1. `pnpm -r typecheck` — clean across all six packages. NOTE: run at repo root, NOT `-F @team-x/desktop` — the workspace-scoped form misses composite-mode regressions (per CLAUDE.md).
2. `pnpm lint` — 0 errors; warnings within +10 of M30 baseline (66 → ≤ 76).
3. `pnpm test` — target ~905 unit tests, all green. Net delta from M30: +~85.
4. ABI rebuild dance: `cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npx node-gyp rebuild --release` (Node ABI), then `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar` (Electron ABI).
5. `pnpm -F @team-x/desktop test:e2e:run` — 8 specs, all green.
6. Commit each task atomically; tag milestone commit.
7. Update `.loki/state/orchestrator.json` — `currentMilestone: "M32"`, `previousMilestone: "M31"`, baseline unit tests + E2E counts refreshed, `history.M31` block populated with commits.
8. Clear `.loki/queue/pending.json` (awaiting M32 plan).
9. Rewrite `.loki/CONTINUITY.md` with an M31-complete header, commit table, patterns-to-carry-forward section, known issues post-M31, next-session checklist for M32.

**Tests:** 0 new. Gate-only.

---

## Summary of deliverables

| Deliverable | Type | Location |
|-------------|------|----------|
| Agentic loop core | Pure package | `packages/intelligence/src/loop/` |
| Read-side agentic tools | Main service | `apps/desktop/src/main/services/agentic-tools.ts` |
| `AgenticLoopService` | Main service | `apps/desktop/src/main/services/agentic-loop-service.ts` |
| System-agent role card | Role pack | `role-packs/strategia-official/roles/system-agent.md` |
| `is_system` migration | SQL | `apps/desktop/src/main/db/migrations/0010_employee_is_system.sql` |
| `ensureSystemAgent` bootstrap | Main service | `apps/desktop/src/main/services/system-agent-bootstrap.ts` |
| CommandService dispatch | Main service | `apps/desktop/src/main/services/command-service.ts` (replace stub) |
| Palette step log + stop | Renderer | `apps/desktop/src/renderer/src/features/command/` |
| System-agent thread UX | Renderer | `apps/desktop/src/renderer/src/features/chat/` |
| Agentic settings UI | Renderer | `apps/desktop/src/renderer/src/features/settings/agentic-section.tsx` |
| Agentic settings IPC | Main | `settings.getAgentic` / `settings.setAgentic` |
| `command.stop` IPC | Main | `command-handlers.ts` |
| E2E spec | Playwright | `apps/desktop/e2e/agentic-loop.spec.ts` |
| Test-mode agentic seams | Main | `test-agentic-provider.ts`, `test-agentic-tools.ts` |
| User guide | Doc | `docs/user-guide/agentic-loop.md` |
| CLAUDE.md updates | Doc | `CLAUDE.md` |
| Design doc milestone resequence | Doc | `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md` §9 |

**IPC surface added:**

| Namespace | Channel | Direction | Purpose |
|-----------|---------|-----------|---------|
| command | `command.stop` | renderer → main | Cancel an in-flight agentic run |
| settings | `settings.getAgentic` | renderer → main | Read agentic budget config |
| settings | `settings.setAgentic` | renderer → main | Write agentic budget config |

**Event types added:**

| Event | Emitter | Consumers |
|-------|---------|-----------|
| `agent.step` | `AgenticLoopService` | Palette step log, thread detail |
| `agentic.completed` | `AgenticLoopService` | Audit view, palette terminal UI |
| `agentic.failed` | `AgenticLoopService` | Audit view, palette error UI |

**Settings keys added:**

| Key | Type | Default | Clamp |
|-----|------|---------|-------|
| `agentic_max_steps` | number | 8 | 1–32 |
| `agentic_max_tokens` | number | 8000 | 512–64000 |
| `agentic_timeout_ms` | number | 120000 | 10000–600000 |

---

## Risks + open questions

1. **Scope creep toward write-side tools.** The §7 Task Planner tools (`decompose_project`, `delegate_subtask`, `review_deliverable`) are tempting to include, but they carry approval gates, escalation logic, new event types (`plan.*` / `task.*` / `review.*`), workload scoring, and level-based injection — all of which materially expand the surface. **Mitigation:** deferred to M32. M31 ships READ-ONLY tools. Any PR attempting to add a write-side tool in M31 should be rejected.
2. **Budget exhaustion UX.** If the loop hits the step cap mid-reasoning, the user sees a truncated thread. The error card explains "budget exhausted" but the answer is incomplete. **Mitigation:** default `agentic_max_steps=8` is generous for read-only reasoning (plan + 3-5 tool calls + answer fits comfortably); settings UI exposes the knob; user-guide explains the trade-off.
3. **Tool-call JSON fragility with small local models.** Llama-3.1:8b occasionally emits markdown-fenced JSON or appends prose. **Mitigation:** loop parser strips fences + trims; one-shot nudge prompt on first parse failure; second failure terminates cleanly. Documented in troubleshooting.
4. **Thread proliferation.** Every complex_request creates a new thread forever. Over weeks that could be hundreds. **Mitigation:** not in M31 scope, but flag for follow-up: auto-archive system-agent threads after 30 days of inactivity; add a "Clear Copilot history" button in Settings.
5. **Interaction with meetings.** If a user fires a complex_request during an active meeting, the loop blocks on the orchestrator pause. The palette shows "queued" until the meeting ends. **Mitigation:** document this; the behavior is correct per invariant #2 (orchestrator is the only scheduler). Consider a "meeting in progress — queue or cancel?" prompt as a future enhancement.
6. **Cost visibility.** Loop runs can burn tokens fast with cloud providers. The step card cost footer helps, but no hard USD budget is enforced. **Mitigation:** `agentic_max_tokens` is a proxy (8000 tokens ≈ $0.04 on Sonnet). Future work: per-run USD cap. Flag in CHANGELOG.
7. **Seeding vs migration ordering.** `ensureSystemAgent` must run AFTER the 0010 migration but BEFORE any renderer hits `employees.list`. **Mitigation:** bootstrap order is fixed — `migrate()` → `seedIfEmpty()` → `ensureSystemAgent(company)` for every company — in `main/index.ts`.
8. **Renderer DOM test harness still missing.** Palette step log + step card have no component tests. **Mitigation:** E2E covers the round-trip. Unit test gap is acknowledged and tracked, same posture as M30.

---

## Handoff notes for the next session

1. Read this plan top to bottom before starting T0.
2. Re-read `.loki/CONTINUITY.md` for the M30 patterns-to-carry-forward section, especially: subagent context exhaustion on E2E tasks, `Expect<Equal<A, B>>` drift guards, canned seam pattern, ABI rebuild dance.
3. Start with T0 (migration + system-agent seed). Do not skip ahead to T1 — every downstream task depends on `system-agent` being resolvable per company.
4. After T1 (loop core), run `pnpm -F @team-x/intelligence test` alone to confirm the pure-package tests pass before touching the main process. Isolation is a testing lever; use it.
5. T3 (`AgenticLoopService`) is the biggest single task; consider a subagent for the initial scaffold, but keep verification + commit in the coordinator thread per the M30 T8 lesson.
6. E2E spec (T8) will likely need two subagent passes. Budget accordingly. Use `test-agentic-provider.ts` as the deterministic seam — do not rely on a real LLM in CI.
7. Before T10 (verification), run the ABI rebuild dance for both Node and Electron. Every milestone hits this; do not skip.
8. M32 (Task Planner) enters queue only after M31 closes. When writing M32, revisit §7 of the Phase 5 design doc for the exact `decompose_project` / `delegate_subtask` / `review_deliverable` contracts, workload scoring function, and guardrail settings.

---

**Plan author:** Rocky + Claude (Opus 4.6 / 1M)
**Estimated tasks:** 11 (T0–T10)
**Estimated net unit-test delta:** +~85 (819 → ~905)
**Estimated E2E delta:** +1 spec (7 → 8)
**Estimated session count:** 4–6 (scaffold + core + service + UX + E2E + verify)
