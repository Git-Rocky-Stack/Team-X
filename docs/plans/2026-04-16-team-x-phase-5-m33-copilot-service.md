# M33: Copilot Service — Implementation Plan

**Milestone:** M33 — Copilot Service (periodic analyzer + proactive insights + ask-the-copilot).
**Phase:** 5 — Intelligence Layer.
**Depends on:** M29 (RAG retriever + on-write indexing), **M31** (agentic-loop harness, `system-*` pseudo-employee pattern, pause-aware `providerRouter.complete` wrapper, AbortController stop posture).
**Blocks:** M34 (Copilot UI — sidebar panel + dashboard widget + `Cmd+Shift+K` toggle), M35 (Phase 5 demo + hardening).
**Design reference:** [`2026-04-13-team-x-phase-5-intelligence-layer.md`](./2026-04-13-team-x-phase-5-intelligence-layer.md) §4 + §8 + §9 + §10 + §11 + §12 + §13 (D5, D7, D10) + §14 + §15.
**Previous milestone plan:** [`2026-04-15-team-x-phase-5-m32-task-planner.md`](./2026-04-15-team-x-phase-5-m32-task-planner.md) (structural template — mirror it).
**Status at plan-doc time:** T0 **in flight** (this commit). T1 – T10 pending. Phase 5 design doc §9 M33 row still reads 📋 Planned — flips to 🚧 In progress when T1 lands the first code change.

## Overview

M32 closed the write-side loop: a human at `Cmd+K` can type `"decompose the Q2 launch"` and the agentic harness decomposes → delegates → reviews with a confirmation gate. M33 turns that harness **inside-out**. Instead of a human prompting the loop, the **app itself** prompts the loop on a 5-minute cadence, asks *"what's wrong with this company right now?"*, and surfaces the answer as **insights** — proactive nudges about blocked tickets, cost anomalies, org gaps, workflow drift. The human reads, dismisses, or clicks an action that dispatches back through the M30 command palette.

Conceptually this is the flip-side of M31 + M32:

| | M31 (read-side) | M32 (write-side) | **M33 (copilot)** |
|---|---|---|---|
| Who kicks off the loop | Human at `Cmd+K` | Human at `Cmd+K` | **Scheduler (periodic + event-triggered)** |
| Who surfaces the answer | Palette step-log + Copilot thread | Palette + tickets + audit | **Insight cards + dashboard widget + dismissed-at lifecycle** |
| Actor | `system-agent` | `system-agent` (workload scorer deterministic) | **`system-copilot` (second `is_system=1` row)** |
| Headline surface | Grounded prose answer | Delegated tickets | **`copilot_insights` table + `copilot.insight` bus event** |
| Cadence | On-demand | On-demand + confirmation gate | **Scheduled + event-debounced, zero user prompt** |

M33 ships the **service half** of the copilot — the analyzer, the insights store, the IPC surface, the `ask-the-copilot` routing through the existing agentic harness. The **UI half** (sidebar panel, dashboard widget, `Cmd+Shift+K`, action-intent dispatch) ships in M34. This boundary matches the Phase 5 design §9 milestone breakdown and keeps M33 testable headless via `NODE_ENV=test` + a canned `test-copilot-provider.ts` seam.

### What ships (T1 – T10)

- **`system-copilot` pseudo-employee.** Second `is_system=1` row per company, alongside M31's `system-agent`. Dedicated role card at `role-packs/strategia-official/roles/system/system-copilot.md` with `role_id: system-copilot`, `tools_allowed` scoped to the M31 read-only set (`query_employees` / `query_tickets` / `query_projects` / `query_meetings` / `query_vault` / `query_events`) plus one new introspection tool (`query_copilot_insights` — lets the copilot dedupe against its own prior output). Hidden from `employees.list`, `orgchart.get`, hire pickers, delegation pickers — same filter sweep as M31 T2 extended with `role_id: system-copilot`.
- **Migration 0011 — `copilot_insights` table.** Columns per Phase 5 §8.4 (`id`, `company_id`, `category`, `severity`, `title`, `detail`, `action_suggestion`, `action_intent`, `action_entities_json`, `dismissed_at`, `created_at`, `expires_at`) with CHECK constraints on `category` and `severity`, composite index `idx_insights_company_active ON (company_id, dismissed_at, expires_at)`.
- **`CopilotInsightsRepo`.** CRUD + dedup-aware `upsert` (title-similarity > 0.8 against active rows → merge, not insert) + `listActive(companyId, filter?)` + `dismiss(insightId)` + `expireStale(now)` + JSON-safe projection `{rows, truncated}` mirroring the M31 envelope.
- **Rolling event window.** `CopilotEventWindow` — in-memory, per-company bounded deque (default 100 events). Subscribes to the event bus on company bootstrap, drops the oldest on overflow, exposes `snapshot(companyId)` for the analyzer. Cleared on company archive.
- **`CopilotAnalyzerService` — periodic scheduler.** Per-company `setInterval`-like loop (default 5 min, clamped 1 ≤ `copilot_interval_minutes` ≤ 60). Respects orchestrator pause via the same polling wrapper M31 built (`isCompanyPaused(companyId)` gate on every analysis run). Also listens for **significant events** (meeting-ended, ticket-closed, goal-progress-change, agentic.failed reason=budget_exhausted) and fires a debounced (30s) supplementary analysis. `AbortController`-driven `stop(companyId)` kills an in-flight cycle cleanly on company archive or app quit.
- **Analysis prompt + JSON output contract.** Structured prompt summarizes the rolling window + open tickets + active runs + cost-last-hour + org diff. LLM returns a zod-validated JSON array `[{ category, severity, title, detail, actionSuggestion?, actionIntent?, actionEntities? }]`. Malformed output: one nudge-retry, then skip (mirror M31 T1 forward-scan recovery). Emits `copilot.analyzed` per cycle, `copilot.insight` per newly-persisted insight (severity ≥ warning surfaces as a proactive nudge in the M34 sidebar), `copilot.dismissed` on user dismiss (invariant #11 — every mutation hits the bus).
- **`copilot.*` IPC surface (4 channels).** `copilot.insights` (list active, optional category filter + limit), `copilot.dismiss` (set `dismissed_at`), `copilot.ask` (free-form question → routes through the M31 agentic harness via a new `system-copilot` actor lane), `copilot.configure` (set interval + enabled categories, clamps per settings). Handlers wired through `CommandHandlers`-style facade; preload bridge exposes them on `window.teamx.copilot`.
- **`copilot.ask` via agentic harness.** Reuses `AgenticLoopService` with `employeeId = system-copilot`. Read-only tool set expanded with `query_copilot_insights` so the copilot can ground answers in its own prior analysis ("we've been flagging that same pattern for 3 days"). Runs under the same step/token/timeout budget clamps (`agentic_max_steps` / `agentic_max_tokens` / `agentic_timeout_ms`). Step log surfaces on the Copilot Conversations thread on the **system-copilot employee**, distinct from the M31 system-agent thread — two rows in the sidenav, clearly labeled.
- **Copilot settings subsection.** Three new clamped keys (`copilot_enabled` bool default true, `copilot_interval_minutes` 1 – 60 default 5, `copilot_categories` string[] default all five) + `settings.getCopilot` / `settings.setCopilot` IPC pair + `CopilotSection` UI block under Settings → Runtime (alongside agentic + planner sections).
- **Three-tier canned test seam.** `test-copilot-provider.ts` — `__ECHO_COPILOT__:[json]` sentinel → per-prompt canned analysis table → fallback. Mirrors M30 `test-classifier.ts` / M31 `test-agentic-provider.ts` / M32 `test-agentic-tools.ts` pattern. `NODE_ENV=test` flips the analyzer's provider resolver to the canned swap.
- **E2E spec — `copilot-service.spec.ts`.** Full round-trip: seed rolling-window events → trigger analyzer via `copilot.configure({ intervalMinutes: 0.05 })` + `NODE_ENV=test` → canned provider returns scripted insight array → assert insight in `copilot.insights` response → `copilot.dismiss` → assert `dismissed_at` set → audit row for `copilot.dismissed` → `copilot.ask` → assert grounded answer in Copilot Conversations thread on `system-copilot`. Plus destructive-gate ABSENT assertion — copilot analysis must never fire a confirmation gate even if its prompt synthesizes `"decompose X"` language.
- **User guide.** `docs/user-guide/copilot-service.md` — F10 style: Overview → What it watches → Insight categories → Cadence + event triggers → Settings → Privacy (local LLM, zero phone-home) → Example cycle → Troubleshooting. Sibling to `command-palette.md` (M30 T9) / `agentic-loop.md` (M31 T9) / `task-planner.md` (M32 T9).

### Invariants preserved

1. **Renderer is a pure view.** Copilot sidebar (M34) consumes `copilot.insights` + subscribes to `copilot.insight` / `copilot.dismissed` / `copilot.analyzed` bus events. No LLM, no analyzer dispatch, no DB in the renderer. The M33 E2E spec verifies the service surface headless without any UI.
2. **Orchestrator is the only scheduler.** `CopilotAnalyzerService.tick(companyId)` polls `orchestrator.isCompanyPaused(companyId)` before every analysis run (same wrapper M31 built). A meeting-in-progress queues the cycle; it fires on resume. The copilot does NOT have its own dispatch queue — every LLM call lands on the provider router's slot pool.
3. **MCP Host stays a singleton.** The new `query_copilot_insights` tool is a main-process closure over `CopilotInsightsRepo`, NOT an MCP server. D10 locked.
4. **Provider router is the only LLM touch-point.** Analyzer calls `providerRouter.complete(...)` with `actor: 'system-copilot'`. Privacy tier + concurrency caps + cost tracking flow unchanged. Copilot cycles record as `runs.kind: 'copilot'` for telemetry visibility (Telemetry tab filters supported).
5. **Storage is SQLite + filesystem vault.** `copilot_insights` is the only new table. Rolling event window is intentionally in-memory and ephemeral — on restart the analyzer cold-starts from the last 100 events via `events.list({ companyId, limit: 100 })` warmup (no new storage layer, just a read of the existing append-only events table).
6. **Events table is append-only.** Four new event types appended (`copilot.analyzed`, `copilot.insight`, `copilot.dismissed`, `copilot.expired`), payloads JSON-safe, discriminator field `type`. AuditView consumes them read-only with new filter chips in T9.
7. **Zero phone-home.** No new network surface. No new anonymized telemetry. Copilot analysis runs on whatever provider the user configured — if it's Ollama, every byte stays on-device. If the user points at Anthropic, the same privacy-tier filter M18 enforces applies. No external metrics endpoint, no update-check piggyback.
8. **Secrets in OS keychain.** No new secret storage.
9. **Role-pack overrides preserved.** `system-copilot.md` follows the same frontmatter contract as `system-agent.md` (id / name / level / tools_allowed / tools_denied / preferred_providers / etc.). User customization via role overrides (phase-future) continues to apply.
10. **Runtime strategy adaptive.** Analyzer respects runtime slot counts. Lean strategy (1 slot) + active agent run → analyzer waits for slot. No bypass.
11. **IPC mutations emit bus events.** `copilot.dismiss` emits `copilot.dismissed`. `copilot.configure` emits `copilot.configured`. Analyzer write-through emits `copilot.analyzed` + per-insight `copilot.insight`. Every state mutation is observable on the bus, so M34's renderer caches will invalidate without manual refetch — same discipline that closed the M30 `vault-backup.spec.ts` regression (CLAUDE.md invariant #11, M31 F2 closure pattern).

### Success criteria

- A company with seeded rolling-window events, after one analyzer tick under the canned test provider, produces ≥ 1 insight in `copilot_insights`, emits `copilot.insight` on the bus, and surfaces an `audit.list` entry tagged `copilot.insight`. Dismissing sets `dismissed_at` and emits `copilot.dismissed`. No confirmation gate ever fires — analyzer runs are non-destructive by construction (insights are advisory rows, not ticket writes).
- Dedup works end-to-end: two consecutive analyzer ticks with identical input produce ONE insight row, not two. `copilot-analyzer.test.ts` asserts title-similarity merge with 4+ cases.
- Pause-awareness verified: `orchestrator.pauseCompany(companyId)` mid-tick → the in-flight `providerRouter.complete` wrapper coerces to `canceled` status, no insight is persisted, no `copilot.analyzed` event fires. Resume → next tick runs. Mirrors M31 pause test.
- `copilot.ask("why is the frontend team behind?")` routes through the agentic harness with `system-copilot` as actor, returns a grounded answer citing existing insights + repo data, step log persists on the `system-copilot` Copilot Conversations thread (distinct from `system-agent`'s). Assertable via the T8 E2E.
- `copilot-service.spec.ts` green. All 9 prior E2E specs green (smoke, ticket-flow, meeting-flow, vault-backup, rag-flow, command-palette, agentic-loop, task-planner, + the new copilot spec → 10 .spec.ts files). `pnpm -r typecheck` clean across all six packages. Biome lint: 0 errors, ≤ 34 warnings (maintains M32 T10 baseline of 24 with a +10 budget for new step-card variants if any).
- Unit test baseline: 1033 → ~1058 (+~25 — aligns with design §9 estimate). E2E: 8 specs → 9 specs (10 Playwright cases counting multi-case specs).
- `NODE_ENV=test` seam extended: canned `test-copilot-provider.ts` seeded with scripted insight arrays; canned agentic provider extended with `system-copilot`-actor prompt entries. Existing M32 seams untouched. No Ollama, no network — same posture as M31 + M32.
- Phase 5 design doc §9 M33 row flipped to ✅ Complete in T10 (after all gates pass). §15 Follow-ups (post-M32) cleared if anything surfaced; new §16 Follow-ups (post-M33) added if any.

## Task breakdown

### T0: Plan doc — this commit

**Scope:** Author this file at `docs/plans/2026-04-16-team-x-phase-5-m33-copilot-service.md`. Does NOT touch the Phase 5 design doc §9 status row yet — that flips 📋 Planned → 🚧 In progress in T1 when the first code change lands. Does NOT materialize T1–T10 into `.loki/queue/pending.json` yet — that's a separate ledger commit when T1 is claimed.

**Commit:** `feat(m33): M33 T0 — plan doc`.
**Tests:** 0.
**Ledger follow-up:** `chore(loki): M33 T0 — commit ledger (<sha>)` updating `.loki/state/orchestrator.json` (move T0 into `inFlightMilestone.M33` with commit sha) + `.loki/queue/pending.json` (promote T1 to head-of-queue, keep T2–T10 as lookahead entries) + `.loki/CONTINUITY.md` (append M33 T0 DONE subsection).

### T1: Migration 0011 + `CopilotInsightsRepo`

**Scope:** Schema + repo. Pure data layer, no provider dispatch.

**Deliverables:**
- `apps/desktop/src/main/db/migrations/0011_copilot_insights.sql` — table + index per Phase 5 §8.4. Foreign key `company_id REFERENCES companies(id) ON DELETE CASCADE` (matches the archive-sweep semantics from M7).
- `CopilotInsightsRepo` in `apps/desktop/src/main/repos/copilot-insights.ts`. Methods: `create`, `listActive({companyId, category?, severity?, limit?})`, `dismiss(id)`, `expireStale(now)`, `upsertWithDedup(draft, ctx)` (title-similarity > 0.8 merge; uses Jaccard bigram over lowercased titles, cheap + deterministic), `getById`.
- Drizzle schema additions to `apps/desktop/src/main/db/schema.ts`.
- Unit tests in `copilot-insights-repo.test.ts`: CRUD (4), dedup Jaccard threshold (6 — exact match / same-title-different-detail / different-title-same-category / below-threshold / case-insensitivity / special-character safety), expireStale (2), listActive filter composition (3).

**Commit:** `feat(m33): M33 T1 — copilot_insights table + repo`.
**Tests:** +15 unit.
**Side effect:** Phase 5 design doc §9 M33 row flips 📋 Planned → 🚧 In progress (same commit).

### T2: `system-copilot` pseudo-employee + role card

**Scope:** Second `is_system=1` row, parallel to M31's `system-agent`. Hidden from every human-facing employee surface.

**Deliverables:**
- `role-packs/strategia-official/roles/system/system-copilot.md` — NEW. Frontmatter: `id: system-copilot`, `name: Team-X Copilot (analyzer)`, `level: system`, `reports_to: []`, `manages: []`, `preferred_model_tier: mid`, `preferred_providers: [ollama, anthropic]`, `fallback_providers: [openai, groq]`, `tools_allowed: [query_employees, query_tickets, query_projects, query_meetings, query_vault, query_events, query_copilot_insights]`, `tools_denied: [shell, filesystem_write, filesystem_read, network, send_message_to_colleague, list_colleagues, decompose_project, delegate_subtask, review_deliverable]`, `decision_authority: advisory`, `output_format`, `temperature: 0.2`, `license: MIT`, `author: Team-X`, `version: 1.0.0`. Body mirrors `system-agent.md` with explicit emphasis on proactive monitoring, not reactive question-answering.
- `ensureSystemCopilot(companyId)` in `apps/desktop/src/main/services/system-employees.ts` (extend the M31 `ensureSystemAgent` module — don't create a new one). Idempotent upsert into `employees` with `is_system = 1`, `role_id = 'system-copilot'`.
- Extend the existing filter sweep: `employees.list`, `orgchart.get`, hire-dialog picker, delegation picker, meeting-attendee picker — all must filter BOTH `role_id: system-agent` AND `role_id: system-copilot`. Replace point-check with a `isSystemRoleId(roleId)` predicate in `packages/shared-types` to prevent a third system role from regressing.
- Bootstrap trigger: `ensureSystemCopilot` called from the same `companies.create` + app-init paths as `ensureSystemAgent`. Backup restore post-hook (flagged for M34+ follow-up per M32 CONTINUITY) remains TODO.
- Unit tests: `system-employees.test.ts` extended with 4 cases (fresh-create, idempotent-re-run, both-system-roles-present-after-bootstrap, filter-sweep-hides-both).

**Commit:** `feat(m33): M33 T2 — system-copilot pseudo-employee + role card`.
**Tests:** +4 unit.

### T3: Rolling event window + bus subscription

**Scope:** In-memory bounded deque per company, fed by the event bus.

**Deliverables:**
- `CopilotEventWindow` class in `apps/desktop/src/main/services/copilot-event-window.ts`. Internal: `Map<companyId, Array<Event>>` with bounded length (default 100, configurable via `copilot_window_size` — NOT a user-facing setting for M33; private module constant).
- `subscribe(bus)` hooks `bus.on('*')` (or enumerates the Phase 5 event types manually if wildcard-on not supported — verify against existing bus impl) and pushes into the relevant company's deque, dropping the oldest on overflow.
- `snapshot(companyId): Event[]` — returns a defensive copy.
- Warm-start: on first `snapshot(companyId)` call for a company, if the in-memory deque is empty, hydrates from `eventsRepo.list({ companyId, limit: 100, orderBy: 'desc' })` so analyzer ticks after app restart don't start cold.
- `clear(companyId)` — called from `companies.archive` (extend the existing archive handler).
- Unit tests: `copilot-event-window.test.ts` — deque bounds (3), per-company isolation (2), warm-start hydration (2), archive clear (1).

**Commit:** `feat(m33): M33 T3 — rolling event window + bus subscription`.
**Tests:** +8 unit.

### T4: `CopilotAnalyzerService` — periodic scheduler + LLM + dedup + expiry

**Scope:** The headline feature. Mirrors `AgenticLoopService` structure — pause-aware, budget-clamped, AbortController-cancellable.

**Deliverables:**
- `CopilotAnalyzerService` in `apps/desktop/src/main/services/copilot-analyzer-service.ts`. API:
  - `start(companyId)` — begins the periodic loop for a company.
  - `stop(companyId)` — fires AbortController, tears down the interval handle.
  - `tick(companyId, opts?)` — single-cycle runner (public for event-triggered invocation + T9 E2E).
  - `getLastAnalysisAt(companyId)` — for telemetry + the "last analyzed N min ago" UI hint (M34 reads this).
- Analysis prompt builder `buildAnalysisPrompt(snapshot, openTickets, activeRuns, costLastHour, orgChart): string` — summarizes inputs to ≤ 2000 tokens. Deterministic ordering so LLM output is reproducible under the canned seam.
- Zod schema `InsightDraftSchema` validates LLM JSON output. Malformed → one nudge-retry (structured "please return JSON matching schema X"), then skip cycle (emit `copilot.analyzed` with `insightsGenerated: 0, reason: 'malformed_output'`).
- Pause-aware provider call: `providerRouter.complete({ actor: 'system-copilot', ... })` wrapped in the same poll-`isCompanyPaused` pattern M31 shipped. Poll interval 250ms prod, 2ms test (reuse M31 constants).
- Dedup via `CopilotInsightsRepo.upsertWithDedup`. Emits `copilot.insight` only for newly-inserted rows, not merges.
- Expiry: each cycle, calls `copilotInsightsRepo.expireStale(now)` and emits `copilot.expired` per expired row. Default `expires_at = created_at + 24h` (configurable per-insight via LLM output; clamped server-side to 1h – 7d).
- Event-triggered supplementary runs: `CopilotEventWindow` bus subscription extended with a 30s-debounced `triggerAnalysis(companyId, reason)` for four signal types (`meeting.ended`, `ticket.closed`, `goal.progressChanged`, `agentic.failed` with reason `budget_exhausted`).
- `runs` table extension: `kind` enum accepts new value `'copilot'`. Drizzle migration bundled here (migration 0012 — single `ALTER TABLE` adding the enum value; if SQLite doesn't enforce enums at DDL level, confirm the application-layer check allows `'copilot'` as valid).
- Unit tests: `copilot-analyzer.test.ts` — prompt builder determinism (3), JSON-validation + nudge-retry (3), pause-aware dispatch (2), dedup integration (2), expiry cycle (2), event-triggered debounce (2).

**Commit:** `feat(m33): M33 T4 — copilot analyzer service + pause-aware scheduler`.
**Tests:** +14 unit.

### T5: `copilot.*` IPC channels + handlers + preload

**Scope:** Four IPC channels per Phase 5 §8.6, typed end-to-end.

**Deliverables:**
- Add `copilot` namespace to `TeamXApi` in `packages/shared-types/src/ipc.ts`.
- Channels: `copilot.insights({ companyId, category?, severity?, limit? }) → { insights: CopilotInsight[] }`, `copilot.dismiss({ insightId }) → { success: true }`, `copilot.ask({ companyId, question }) → { runId, threadId }` (returns ids for the renderer to attach a step-stream subscription — SAME shape as M31 `command.execute` for `complex_request`), `copilot.configure({ intervalMinutes?, enabledCategories? }) → { success: true }`.
- Main-process handlers in `apps/desktop/src/main/ipc/copilot-handlers.ts`.
- Preload bridge: `window.teamx.copilot.{insights, dismiss, ask, configure}` — same generator helper used for `command` + `settings` namespaces.
- `CopilotInsight` type in `packages/shared-types/src/copilot.ts` — wire-shape mirrors the DB row projection minus internal timestamps.
- Unit tests: `copilot-handlers.test.ts` — each channel round-trip with happy-path + one error case = 4 × 2 = 8.

**Commit:** `feat(m33): M33 T5 — copilot.* IPC surface + preload bridge`.
**Tests:** +8 unit.

### T6: `copilot.ask` via agentic harness + `query_copilot_insights` tool

**Scope:** Route `copilot.ask` through `AgenticLoopService` with `employeeId = system-copilot`. Add the one new read-only tool.

**Deliverables:**
- `copilot-handlers.ts::ask` calls `agenticLoopService.start({ companyId, threadId, employeeId: systemCopilotId, prompt })` — reuses the M31 machinery. Returns `{ runId, threadId }` so the palette (M34) can subscribe to the step stream.
- `agentic-tools.ts::query_copilot_insights` tool factory — read-only, wraps `CopilotInsightsRepo.listActive` with the `{rows, truncated}` envelope + 50-row cap. Schema: `{ category?, severity?, dismissed?: boolean, limit? }`.
- Tool-registry wiring: `system-copilot` actor gets the M31 read-only tool set + the new `query_copilot_insights` tool. `system-agent` actor continues to get the original M31 read-only set (NOT `query_copilot_insights` — enforces each system role's distinct lane).
- Copilot Conversations thread UX: `useThreadList` already handles `agentic.completed` / `agentic.failed` invalidation (M32 T1) — no change needed. The sidenav will display TWO system threads: `system-agent` (from M31) and `system-copilot` (new). Renderer label logic: show role's `name` field, not `role_id`, so they're distinguishable in the existing list.
- Unit tests: `copilot-ask.test.ts` — actor routing (1), tool availability per actor (2), `query_copilot_insights` projection (2).

**Commit:** `feat(m33): M33 T6 — copilot.ask routing + query_copilot_insights tool`.
**Tests:** +5 unit.

### T7: Settings — copilot subsection + clamped IPC

**Scope:** Three new settings keys + IPC pair + UI block.

**Deliverables:**
- Settings repo: `getCopilot()` / `setCopilot(partial)` — returns `{ enabled: boolean, intervalMinutes: number, categories: CopilotCategory[] }`. Clamps: `intervalMinutes` ∈ [1, 60], `categories` ⊆ `['operational', 'cost', 'org', 'workflow', 'anomaly']`. Defaults per Phase 5 §11.
- IPC channels: `settings.getCopilot` / `settings.setCopilot` in the existing settings namespace.
- `CopilotSection` UI component in `apps/desktop/src/renderer/src/features/settings/copilot-section.tsx` — toggle, interval slider (1–60 min, step 1), five-checkbox category multiselect. Placed under Settings → Runtime, alongside agentic (M31 T7) + planner (M32 T7) sections.
- Wiring: `setCopilot` calls trigger `copilotAnalyzerService.restart(companyId)` under the hood (stop + recompute interval + start) so toggling `enabled` or changing `intervalMinutes` takes effect immediately, no app reload.
- Unit tests: `settings-copilot.test.ts` — defaults (1), clamp min (1), clamp max (1), invalid category rejected (1), valid subset accepted (1), restart-on-change trigger (2).

**Commit:** `feat(m33): M33 T7 — copilot settings + UI`.
**Tests:** +7 unit.

### T8: Test seam — `test-copilot-provider.ts`

**Scope:** Three-tier canned provider for the analyzer LLM calls. Mirror M30 `test-classifier` / M31 `test-agentic-provider` / M32 `test-agentic-tools`.

**Deliverables:**
- `apps/desktop/src/main/services/test-copilot-provider.ts` — `__ECHO_COPILOT__:<json>` sentinel (parses the suffix as a scripted `InsightDraft[]`), canned per-prompt table (keyed on a prompt-hash deterministic under the prompt builder from T4), generic fallback emitting a single low-severity "no-op insight" to keep E2E specs moving when a prompt isn't canned.
- Composition root: `buildCopilotProvider(providerRouter, env)` returns the canned provider in `NODE_ENV=test`, the real `providerRouter.complete` wrapper otherwise.
- Canned agentic-provider extension for `copilot.ask` flows: extend `test-agentic-provider.ts` with `system-copilot`-actor prompt entries (3-5 canned answers covering the T9 E2E script).
- Unit tests: `test-copilot-provider.test.ts` — sentinel parse (2), canned-table lookup (2), fallback shape (1).

**Commit:** `test(m33): M33 T8 — canned copilot provider seam`.
**Tests:** +5 unit.

### T9: E2E spec — `copilot-service.spec.ts`

**Scope:** Full round-trip against the canned test provider. One .spec.ts file, one or two Playwright cases.

**Deliverables:**
- `apps/desktop/e2e/copilot-service.spec.ts`. Test flow:
  1. Boot Electron with `NODE_ENV=test`.
  2. `copilot.configure({ intervalMinutes: 1 })` via IPC helper.
  3. Seed events via fixtures (create a ticket, close a ticket, create+end a meeting) — exercise the warm-start hydration path.
  4. Call `copilot.tick(companyId)` directly (exposed as a `__test__` IPC in test-mode) to avoid waiting 60s for the scheduler.
  5. Assert `copilot.insights({ companyId })` returns ≥ 1 insight matching the canned table.
  6. Dismiss one insight → assert `dismissed_at` set + `audit.list` shows a `copilot.dismissed` row.
  7. `copilot.ask({ companyId, question: "what are the top 3 blockers?" })` → subscribe to the step stream via the existing palette harness → assert a grounded answer step lands on the `system-copilot` thread.
  8. Assert destructive-confirmation gate is ABSENT throughout (copilot analysis is advisory; write-side gate must not fire).
  9. Assert the sidenav shows TWO system-threads (system-agent + system-copilot), both distinguishable by `name` field.
- Canned provider additions: 2-3 scripted insight arrays + 1-2 scripted ask answers (re-use the T8 test-copilot-provider + T8 extension to test-agentic-provider).
- Pattern: one subagent pass for the canned-script generation (budget per M32 T8 handoff note), coordinator does git-diff verification + biome spot-check + atomic commit.

**Commit:** `test(m33): M33 T9 — copilot-service.spec.ts E2E round-trip`.
**Tests:** +1 E2E spec (1-2 Playwright cases).

### T10: Documentation + verification + milestone marker

**Scope:** Docs pass, Phase 5 design doc sync, full verification gate run, ledger close.

**Deliverables:**
- `docs/user-guide/copilot-service.md` — NEW. F10 style: Overview → What it watches → Insight categories + examples → Cadence (periodic 5min default) + event triggers → Settings walkthrough → Privacy (local + on-device + zero phone-home) → Example cycle (narrative walkthrough with screenshots deferred to M34) → Troubleshooting (rebuild ABI dance, settings conflicts, pause-during-meeting expected behavior, stale insights + expiry knob, dedup false-positives, how to reset the window).
- `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md` §9 M33 row: 🚧 In progress → ✅ Complete. If any deferred items surface, add §16 Follow-ups (post-M33). §15 Follow-ups (post-M32) reviewed and cleared if fully resolved.
- `CLAUDE.md` Status section + "Phase 5 — in progress" bullet: append M33 complete line with test-delta summary. Mirror M32's line shape. Update IPC channels table with the 4 new `copilot.*` rows. Add the 4 new bus events to the Phase 5 bus-events table (with `copilot.analyzed` / `copilot.insight` / `copilot.dismissed` / `copilot.expired` payload shapes). Bump the unit test + E2E counts.
- `CHANGELOG.md` — add an M33 entry under Phase 5. Keep a Changelog format.
- `README.md` — Phase 5 checkbox row updated. Feature bullet for "Proactive Copilot" (or similar) moved from 📋 to ✅.
- `.loki/CONTINUITY.md` — rewrite top section with M33-COMPLETE header, commit table (T0–T10), test delta (1033 → ~1058 unit + 8 → 9 E2E), patterns-to-carry-forward (periodic-scheduler-pause-aware pattern, insight dedup pattern, second `is_system` pseudo-employee pattern, event-window warm-start pattern), next-session checklist for M34 (Copilot UI).

**Verification gate — same T10 discipline as M31 + M32:**
1. `pnpm -r typecheck` — clean across all six packages (repo root, not `-F`).
2. `pnpm lint` — 0 errors; warnings ≤ 34 (baseline 24 + 10 budget).
3. `pnpm test` — ~1058/1058 green. Net delta from M32 baseline: +~25.
4. **ABI rebuild dance** (mandatory before E2E):
   - Node ABI: `cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npx node-gyp rebuild --release` (ditto for keytar if the better-sqlite3 rebuild invalidates it).
   - Electron ABI: `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar` (**comma-separated form only** — repeated `-w` flags crash `@electron/rebuild@3.7.2` with `argv.w.split is not a function`).
5. `pnpm -F @team-x/desktop test:e2e:run` — 9 specs (including new `copilot-service.spec.ts`), all green.
6. `.loki/state/orchestrator.json` — move `inFlightMilestone.M33` into `history.M33`; set `currentMilestone: 'M34'`, `previousMilestone: 'M33'`, `previousMilestoneCompletedAt: <ISO>`, baseline refreshed.
7. `.loki/queue/pending.json` — cleared with M34 scope notes (previous milestones left `tasks: []` with scope sketch — mirror that).

**Commit:** `chore(m33): M33 T10 — verification + milestone marker`.
**Tests:** 0 (gate-only).
**Ledger follow-up:** `chore(loki): M33 COMPLETE — verification + ledger` or per-task ledger `chore(loki): M33 T10 — commit ledger (<sha>)` — match the M32 pattern exactly (`chore(loki): M<N> T<N> — commit ledger (<sha>)`).

## Summary of deliverables

| Deliverable | Type | Location |
|-------------|------|----------|
| `copilot_insights` table + index | Migration | `apps/desktop/src/main/db/migrations/0011_copilot_insights.sql` (T1) |
| `runs.kind = 'copilot'` extension | Migration | `apps/desktop/src/main/db/migrations/0012_runs_kind_copilot.sql` (T4) |
| `CopilotInsightsRepo` | Main repo | `apps/desktop/src/main/repos/copilot-insights.ts` (T1) |
| `system-copilot` role card | Role pack | `role-packs/strategia-official/roles/system/system-copilot.md` (T2) |
| `ensureSystemCopilot` bootstrap | Main service | `apps/desktop/src/main/services/system-employees.ts` (T2, extend) |
| `isSystemRoleId` predicate | Shared type | `packages/shared-types/src/roles.ts` (T2) |
| `CopilotEventWindow` | Main service | `apps/desktop/src/main/services/copilot-event-window.ts` (T3) |
| `CopilotAnalyzerService` | Main service | `apps/desktop/src/main/services/copilot-analyzer-service.ts` (T4) |
| `copilot.*` IPC + handlers | IPC | `apps/desktop/src/main/ipc/copilot-handlers.ts` + preload (T5) |
| `CopilotInsight` wire type | Shared types | `packages/shared-types/src/copilot.ts` (T5) |
| `query_copilot_insights` tool | Main service | `apps/desktop/src/main/services/agentic-tools.ts` (T6, extend) |
| `copilot.ask` router | Main service | `copilot-handlers.ts::ask` → `AgenticLoopService` (T6) |
| Copilot settings + UI | Main + UI | `settings-service.ts` + `copilot-section.tsx` (T7) |
| Canned copilot provider | Test seam | `apps/desktop/src/main/services/test-copilot-provider.ts` (T8) |
| E2E spec | Test | `apps/desktop/e2e/copilot-service.spec.ts` (T9) |
| User guide | Docs | `docs/user-guide/copilot-service.md` (T10) |
| Phase 5 §9 status flip | Docs | `docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md` (T1 + T10) |
| CLAUDE.md + CHANGELOG + README updates | Docs | root (T10) |

## Risks + open questions

- **Rolling-window memory footprint.** 100 events/company × N companies × ~1 KB/event ≈ 100 KB/company. Negligible. But if a user runs 20 companies, that's 2 MB always-resident. Mitigation: make window size a private constant for M33, expose as `copilot_window_size` in a future milestone if memory surfaces.
- **Dedup false-positives via Jaccard bigram at 0.8.** A real insight titled `"Alice has 3 blocked tickets"` and a next-cycle `"Alice has 4 blocked tickets"` may merge under aggressive similarity. Mitigation: supplement Jaccard with a category + severity equality check (titles only merge within the same category), and ship a 6-case dedup test that includes the blocked-ticket-count drift scenario as a MUST-NOT-MERGE case. **Recommend:** ship the category-scoped dedup in T1; revisit threshold if false merges observed.
- **Event-triggered debounce conflicts with scheduled interval.** A burst of closed tickets could fire a debounced analysis 30s after a scheduled one just completed. Mitigation: coalesce — if `getLastAnalysisAt(companyId) + 60s > now`, skip the debounced trigger. Document the 60s coalesce window in the user guide.
- **`system-copilot` vs `system-agent` user confusion.** Two system threads in the sidenav may surprise users. Mitigation: the renderer sidenav (M34) will group them under a "Copilot Conversations" heading with distinct subtitles ("Ask me anything" vs "Automated insights"). Call this out in the user guide + M34 plan doc.
- **Canned provider output drift.** If the analyzer prompt changes between T4 implementation and T9 spec-write, the prompt-hash keys in `test-copilot-provider.ts` go stale. Mitigation: stabilize the prompt builder in T4 before T8. If drift happens during T9, the canned table is regenerated via a `pnpm test:generate-canned` utility script (add as a one-off script in T8 if the fixture count exceeds ~5 entries).
- **Migration 0012 (runs.kind) vs migration 0011.** Two migrations in one milestone. Alternative: bundle them as a single 0011. **Recommend:** keep separate — 0011 is schema, 0012 is a single-line enum extension; separate files document intent clearly. Mirror M32's single-migration footprint if we instead bundle.
- **`copilot.ask` runs can fire concurrently with analyzer ticks.** Both hit `providerRouter.complete` with `actor: 'system-copilot'`. Two slots consumed. Same pattern as M32 T2's nested-dispatch risk (documented there as acceptable 2× cost). **Recommend:** accept; revisit if cap pressure emerges in telemetry.

## Handoff notes for the next session

- **T1 + T2 can be a single session.** T1 is a new table + repo, T2 is bootstrapping + role-card + filter-sweep. Different files, but tight coupling. Split commits per task, no reason to split sessions.
- **T3 is small and independent** — ~60 minutes, no provider calls, deterministic tests. Good session-starter after T2.
- **T4 is the single biggest task.** Budget a full session. Prompt builder + JSON validation + pause-aware wrapper + dedup + expiry + event-triggered debounce in one service. The test file will be ~300 LOC. Subagent candidate for the prompt-builder scaffolding (similar pattern to M31 T1 subagent pass).
- **T5 is IPC boilerplate** — generate-heavy, well-established pattern. ~30 minutes.
- **T6 depends on T5 (for the IPC surface) and T2 (for the system-copilot actor id).** Don't start before both land.
- **T7 is the second-fastest task** — settings pattern is well-worn (M31 T7 + M32 T7 are the templates). ~25 minutes.
- **T8 is prerequisite for T9.** Build T8 scripted tables FIRST, then T9 consumes them. If T9 needs a case not in T8, extend T8 in the same session.
- **T9 is a full session.** Subagent the canned-script generation (budget ~1 subagent pass per M31/M32 precedent). Coordinator does git-diff verification + biome spot-check + atomic commit.
- **T10 is gate-only + docs.** Budget ~60 minutes. NOT skippable. ABI rebuild dance is mandatory. `tsc --build --force` in `packages/shared-types` is no longer needed (fixed in M32 plan-doc session — `tsc --build` is the default script). Partial-truth docs are a cut corner per M31/M32 T9 gotcha — audit surrounding staleness when editing each doc file.
- **Commit cadence:** `<type>(m33): M33 T<N> — <summary>` for work commits, `chore(loki): M33 T<N> — commit ledger (<sha>)` immediately after, updating `.loki/state/orchestrator.json` + `.loki/queue/pending.json` + `.loki/CONTINUITY.md`. Same atomic pattern M30 + M31 + M32 used — twenty-two ledger commits across those three milestones, zero deviations.
- **Architectural seams carried forward from M31 + M32 (active for M33):** three-tier canned test seam, `{rows, truncated}` envelope, `data-step-kind` stable E2E selectors, pause-aware `providerRouter.complete` wrapper, `AbortController` stop with canceled-status coercion, atomic commits + ledger commits, bus-event + audit-row invariant (#11), `is_system` column + filter-sweep pattern, `isSystemRoleId` predicate (new in M33 T2 — extract from point-checks).
- **Blocker for M34:** M33 must expose `copilot.ask` with the same runId/threadId return shape M31's `command.execute complex_request` returns, so the M34 sidebar can attach the step-stream subscription without a second wire format. Verify this in T6.
