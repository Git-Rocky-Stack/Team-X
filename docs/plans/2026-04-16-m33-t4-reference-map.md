# M33 T4 — CopilotAnalyzerService Reference Map

Generated 2026-04-16 to feed the T4 implementation session.

## 1. M31 AgenticLoopService shape

`apps/desktop/src/main/services/agentic-loop-service.ts`

- **Factory:** `createAgenticLoopService(deps: AgenticLoopDeps): AgenticLoopService`.
- **API surface (lines ~140–290 of the public type, implementation ~450–780):**
  - `start(args: StartArgs): Promise<StartResult>` where `StartArgs = { companyId, userText, employeeId? }`, `StartResult = { runId, threadId }`.
  - `stop(runId: string): void` — aborts `AbortController`.
  - `getRun(runId): AgenticLoopRunState | null` — internal shape (includes `LoopStep[]`, not JSON-safe).
  - `getRunSnapshot(runId): AgenticRunSnapshot | null` — IPC-safe projection (M32 T0).
  - `waitForRun(runId): Promise<void>` — resolves when terminal side-effects fired.
- **Deps shape (locate `AgenticLoopDeps`):** `bus`, `orchestrator: { isCompanyPaused(companyId: string): boolean }`, `providerRouter: { complete: LoopCompleteFn }` (referenced via `resolved.complete`), `runsRepo`, `threadsRepo`, `messagesRepo`, `employeesRepo` (with `getById`), `buildTools({ companyId, signal, employee })`, `getBudgets?`, `pauseGatePollMs?`, `threadSubjectPrefix?`, `logger?`.
- **Pause-poll constants:** only `DEFAULT_PAUSE_POLL_MS` is defined in the file (no PROD/TEST split in the source I read); `pausePollMs = deps.pauseGatePollMs ?? DEFAULT_PAUSE_POLL_MS`. CLAUDE.md mentions "250ms prod, 2ms test" — that's achieved by injecting `pauseGatePollMs` from the composition root / tests.
- **Pause-aware wrapper (~lines after `resolveBudgets`):**
  ```ts
  const pauseAwareComplete: LoopCompleteFn = async (req) => {
    await waitUntilUnpaused(args.companyId, req.signal);
    return resolved.complete(req);
  };
  ```
  `waitUntilUnpaused` loops `while (deps.orchestrator.isCompanyPaused(companyId))`, respects `signal.aborted` → throws `DOMException('Aborted', 'AbortError')`, otherwise `setTimeout(pausePollMs)`.
- **AbortController:** one per run, stored in `RegisteredRun { state, controller, completion }` inside `runs: Map<string, RegisteredRun>`. `stop(runId)` calls `entry.controller.abort()`.
- **Canceled-status coercion:** after `loop.run()` returns, if `controller.signal.aborted && state.status !== 'completed'`, force `state.status = 'canceled'`, `errorReason = 'canceled'`, default message `'Run canceled by user'`. Same coercion in the catch branch when `loop.run` throws.
- **Runs-table write (`finishRun`):** calls `deps.runsRepo.finish(state.runId, { status: runStatus, promptTokens, completionTokens, latencyMs, costUsd: formatCostUsd(state.costUsd), toolCallsCount, error })`. `runStatus` maps `'completed' → 'success'`, `'canceled' → 'cancelled'` (double-l, matching `RunStatus`), else `'error'`.
- **Bus events:**
  - `agent.step` emitted in `onStep` handler per loop step — `{ type, companyId, actorId: actorEmployee.id, actorKind: 'employee', payload: AgentStepPayload }`.
  - Terminal (`finishRun`): `agentic.completed` OR `agentic.failed` (exactly one) with `actorId: state.systemAgentId`.
- **Nudge-retry:** lives inside the pure `createAgenticLoop` (forward-scan brace-balanced tool-call parser grants one nudge per malformed step) — not in the service.

## 2. Migration for `runs.kind` / `employees.is_system`

`apps/desktop/src/main/db/migrations/` contains:
```
0000_initial.sql … 0009_command_history.sql
0010_employee_is_system.sql
0011_copilot_insights.sql
```

**0010 (verbatim):**
```sql
ALTER TABLE `employees` ADD COLUMN `is_system` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_employees_is_system` ON `employees` (`company_id`) WHERE `is_system` = 1;
```

**There is no `runs.kind` enum column today.** The runs schema (see §7) does not carry a `kind` column — CLAUDE.md's reference to "kind='agentic'" is aspirational. The current `runs` row distinguishes agentic-loop runs only via (a) the Copilot thread they author into, and (b) their `actorId = systemAgentId`. T4 can either follow the same pattern or file a new migration adding `kind` with the SQLite temp-table swap — no prior CHECK-extension precedent exists in these 12 migration files for runs.

## 3. CopilotInsightsRepo (T1)

`apps/desktop/src/main/db/repos/copilot-insights-repo.ts`

Factory: `createCopilotInsightsRepo<TRunResult>(db: CopilotInsightsDb<TRunResult>)`.

Methods returned:
- `create(input: CreateCopilotInsightInput): string` — returns new id.
- `getById(id: string): CopilotInsightRow | null`.
- `listActive(filter: ListActiveFilter): CopilotInsightRow[]` — filter `{ companyId, category?, severity?, limit?, now? }`; excludes dismissed + expired, newest-first.
- `dismiss(id: string, now?: number): void` — idempotent via `isNull(dismissedAt)` guard.
- `expireStale(now: number): number` — physically deletes `expires_at < now`, returns deleted count.
- `upsertWithDedup(input): { id: string; merged: boolean }` — category-scoped Jaccard bigram > 0.8 with numeric-drift guard. On merge, refreshes `detail`, `severity`, `actionSuggestion`, `actionIntent`, `actionEntitiesJson`, `expiresAt`; preserves `created_at`.

Also exported: `CopilotCategory`, `CopilotSeverity`, `COPILOT_CATEGORIES`, `COPILOT_SEVERITIES`, `DEFAULT_INSIGHT_TTL_MS = 24h`, `JACCARD_MERGE_THRESHOLD`.

## 4. CopilotEventWindow (T3)

`apps/desktop/src/main/services/copilot-event-window.ts`

- Factory: `createCopilotEventWindow(deps: CopilotEventWindowDeps): CopilotEventWindow`.
- Deps: `{ bus: CopilotEventWindowBus, eventsRepo: CopilotEventWindowEventsRepo }` where bus has `subscribe(listener): () => void` and eventsRepo has `listByCompany(companyId, cursor: number | undefined, limit: number): EventRow[]`.
- API: `start(): void`, `stop(): void`, `snapshot(companyId: string): DashboardEvent[]` (defensive copy; warm-start hydrates from events table on first snapshot, chronological order), `clear(companyId: string): void`.
- Internal: `buffers: Map<string, DashboardEvent[]>`, `hydrated: Set<string>`, FIFO eviction at `MAX_EVENTS_PER_COMPANY` (100), excludes `EXCLUDED_EVENT_TYPES`.
- `__TEST_INTERNALS__ = { MAX_EVENTS_PER_COMPANY, EXCLUDED_EVENT_TYPES }`.

## 5. System-copilot identity (T2)

`packages/shared-types/src/roles.ts`:
- `SYSTEM_AGENT_ROLE_ID = 'system-agent'`
- `SYSTEM_COPILOT_ROLE_ID = 'system-copilot'`
- `SYSTEM_ROLE_IDS = [SYSTEM_AGENT_ROLE_ID, SYSTEM_COPILOT_ROLE_ID] as const`
- `isSystemRoleId(id): boolean`

`apps/desktop/src/main/services/system-agent-bootstrap.ts`:
- `ensureSystemCopilot<TRunResult>(args: EnsureSystemEmployeeArgs<TRunResult>): EnsureSystemEmployeeResult` where result is `{ employeeId: string; created: boolean }`.
- Delegates to private `ensureSystemEmployee({ ...args, roleId: SYSTEM_COPILOT_ROLE_ID, displayName: SYSTEM_COPILOT_DISPLAY_NAME, logTag: 'system-copilot' })`.
- Parallel `ensureSystemAgent` exists. Both called by `seedIfEmpty` and (future) `companies.create` IPC.
- Main session resolves at startup by capturing `const { employeeId: copilotId } = ensureSystemCopilot({...})` during seed — same pattern as existing M31 system-agent wiring.

## 6. `events.ts` EventType union

`packages/shared-types/src/events.ts` — full literal union:
```
'work.queued' | 'work.started' | 'token.delta' | 'message.persisted'
| 'message.agent_to_agent' | 'work.completed' | 'work.failed'
| 'employee.status_changed' | 'tool.called' | 'tool.result'
| 'meeting.started' | 'meeting.turn' | 'meeting.interjection' | 'meeting.ended'
| 'vault.file_created' | 'vault.file_deleted' | 'command.executed'
| 'agent.step' | 'agentic.completed' | 'agentic.failed'
| 'plan.proposed' | 'plan.approved' | 'task.delegated' | 'task.escalated'
| 'review.requested' | 'review.completed'
```

Payload convention: one exported `interface XxxPayload { … }` per event (e.g. `AgenticCompletedPayload`, `AgenticFailedPayload`, `AgentStepPayload`, `CommandExecutedPayload`). Category-prefixed pattern (`plan.*`, `task.*`, `review.*`, `agentic.*`, `agent.*`) is already established — T4 should mirror it with `copilot.insight`, `copilot.analyzed`, `copilot.expired` and `CopilotInsightPayload` / `CopilotAnalyzedPayload` / `CopilotExpiredPayload`.

## 7. `schema.ts` runs table (LOC 146–163)

```ts
export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull(),
  threadId: text('thread_id'),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  latencyMs: integer('latency_ms').notNull().default(0),
  /** Decimal string to avoid float drift on sub-cent values. */
  costUsd: text('cost_usd').notNull().default('0'),
  toolCallsCount: integer('tool_calls_count').notNull().default(0),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  /** running | success | error | cancelled. */
  status: text('status').notNull().default('running'),
  error: text('error'),
});
```

**No `kind` column exists.** `RunStatus = 'running' | 'success' | 'error' | 'cancelled'`. `copilotInsights` is defined later in the same file with columns `id, companyId, category, severity, title, detail, actionSuggestion, actionIntent, actionEntitiesJson, dismissedAt, createdAt, expiresAt`.

## 8. providerRouter.complete / LoopCompleteFn

`packages/intelligence/src/loop/types.ts`:
- L198: `export interface LoopCompleteRequest { ... system, messages: LoopMessage[], signal: AbortSignal, ... }`
- L204: `export type LoopCompleteFn = (req: LoopCompleteRequest) => Promise<LoopProviderCompletion>`
- `LoopProviderCompletion = { text: string; usage: { promptTokens, completionTokens }; provider: string; model: string; costUsd: number }`

`packages/provider-router/src/stream.ts` L91: `export async function* streamAgent(args: StreamAgentArgs): AsyncGenerator<StreamChunk>` — this is the wrapper M31 uses via a `resolved.complete` closure that internally drives `streamAgent` to completion and returns a `LoopProviderCompletion`. T4 should reuse the same `streamAgent` wrapping pattern.

## 9. orchestrator.isCompanyPaused

`apps/desktop/src/main/orchestrator/index.ts`:
- L206: `pauseCompany(companyId: string): Promise<void>` (interface)
- L216: `isCompanyPaused(companyId: string): boolean` (interface)
- Implementation L630 / L659 on the concrete `Orchestrator` object.

Index.ts wires it twice (L849, L909) as `isCompanyPaused: (cid) => orchestrator?.isCompanyPaused(cid) ?? false`.

## 10. Composition root (`apps/desktop/src/main/index.ts`)

Module-scope handles (around L250–280): `orchestrator`, `unregisterIpc`, `mcpHostInstance`, `ragIndexerInstance`, `copilotEventWindowInstance`, `commandServiceInstance`, `agenticLoopServiceInstance` — all nullable.

Boot order inside `app.whenReady().then(...)`:
1. `initDb` + `runMigrations` + `initFts5`.
2. `seed()`, `seedDefaultProviders()`, dev key import.
3. Build repos (auditRepo, commandHistoryRepo, companiesRepo, embeddingsRepo, employeesRepo, eventsRepo, goalsRepo, mcpServersRepo, toolCallsRepo, meetingsRepo, messagesRepo, projectsRepo, runsRepo, settingsRepo, threadsRepo, ticketAttachmentsRepo, ticketsRepo).
4. Build `roleLoader`, `providerRouter`, `mcpHost`, `orchestrator` (with `bus`, `calcCost`, `PHASE_1_ORCHESTRATOR_SLOTS = 2`).
5. `createRagIndexer({ bus, service, ... }).start()` → stored as `ragIndexerInstance`.
6. **`copilotEventWindow = createCopilotEventWindow({ bus, eventsRepo }); copilotEventWindow.start(); copilotEventWindowInstance = copilotEventWindow;`**
7. `vaultService`, `backupService`, `updaterService`, `meetingService`.
8. `commandService`, `agenticLoopServiceInstance = createAgenticLoopService({...})`.
9. IPC handler registration + `command.*` IPC bindings (including `command.getRunSnapshot`).
10. `createWindow()`.

**T4 slot-in:** Instantiate `copilotAnalyzerServiceInstance` right after `agenticLoopServiceInstance` and before IPC handler registration — it consumes `copilotEventWindow`, `copilotInsightsRepo`, `runsRepo`, `threadsRepo`, `messagesRepo`, `providerRouter`, `orchestrator`, `bus`, and the `systemCopilotEmployeeId` resolved during seed. A `CopilotEventTrigger` (likely a `setInterval` + bus-subscriber pair) goes adjacent.

**will-quit shutdown order (L+):** ragIndexer.stop() → **copilotEventWindow.stop()** → commandService stop → orchestrator.shutdown() → unregisterIpc() → closeDb(). `agenticLoopServiceInstance` already nulls here; T4 analyzer must slot in alongside `copilotEventWindow.stop()` (both are pure bus subscribers) and its interval/timer cleared first.

## 11. Test-mode provider swap

`apps/desktop/src/main/services/test-agentic-provider.ts`

Three-tier lookup inside `createTestAgenticCompleteFn(options)`:
1. **Sentinel:** `ECHO_AGENT_SENTINEL = '__ECHO_AGENT__:'` embedded in first user message; JSON array of raw assistant strings returned in order via `safeParseSentinel`.
2. **Canned table:** `CANNED_TABLE` keyed on `first.trim().toLowerCase()`. Existing fixtures include `'why is the frontend team behind?'`, `'what is my team doing right now'`, `'decompose the frontend redesign into tickets'`.
3. **Fallback:** `FALLBACK_SCRIPT = [{"action":"final_answer","answer":"I do not have a canned response for this prompt in test mode."}]`.

Per-key call-count map (`callCount: Map<string, number>`) clamps to last entry; `sentinel` key is `__sentinel__:${first}` to keep counters independent. Constants: `TEST_AGENT_PROVIDER = 'test-mode'`, `TEST_AGENT_MODEL = 'test-mode-agent'`. Factory takes optional `{ fixtures: Record<string, readonly string[]> }` merged over `CANNED_TABLE`.

**NODE_ENV=test switch does NOT live here** — the composition root in `main/index.ts` reads `const testMode = process.env.NODE_ENV === 'test'` and chooses `createTestAgenticCompleteFn()` vs the production `streamAgent` wrapper when building the `AgenticLoopService`. T4's test file should mirror this by exporting a parallel `test-copilot-analyzer-provider.ts` (or reusing `createTestAgenticCompleteFn` with analyzer-specific fixtures).
