# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Team-X is

Team-X is an open-source, privacy-first, **local-first desktop app for running AI-agent organizations**. You don't manage prompts or pipelines — you run a **company**: hire employees from a curated F10 role library, assemble an org chart with real hierarchy (Officer → Senior Management → Management → Supervisor → Lead → IC), set company goals, break them into projects, file tickets, watch the team work in real-time on a multi-view cockpit, chat with anyone on demand, and pull everyone into an all-hands meeting with one click. Runs on local models (Ollama / Qwen / Gemma) by default; plug Claude, OpenAI/Codex, Google, OpenRouter, Groq, Together, Fireworks, or any OpenAI-compatible provider when you want cloud power.

**Tagline candidate:** *"Run an AI company. Not a prompt."*

## Source of truth

**Before proposing any architectural change, read the design document:**

- [`docs/plans/2026-04-07-team-x-design.md`](docs/plans/2026-04-07-team-x-design.md) — full approved design (v1.0, 2026-04-07)

The decisions log in §15 of that doc is **locked** unless explicitly revisited with the user. If you find yourself disagreeing with a decision, raise it as a discussion — don't silently deviate.

## Status

**Phase 2 (The Org) — complete.** All 13 milestones shipped.

**Phase 3 (The Live Cockpit) — complete.** All 20 milestones shipped.

**Phase 4 (Ship-readiness) — complete.** All 27 milestones shipped. v1.0.0. 612 unit tests + 4 E2E specs passing.

**Phase 5 (Intelligence Layer) — in progress.** M28 (RAG foundation), M29 (RAG into agent turns), M30 (NLU engine + command palette), M31 (agentic loop — read-side), M32 (task planner — write-side), and **M33 (Copilot Service — periodic analyzer + proactive insights + ask-the-copilot)** all complete. **M34 (Copilot UI — sidebar panel + dashboard widget + `Cmd+Shift+K`) is next.** 1099 unit tests + 9 E2E specs (10 Playwright cases) passing.

### Phase 1 (Skeleton) — complete

- **M1 (repo foundations):** pnpm workspace, TypeScript strict, Biome, Vitest, CI.
- **M2 (shared packages):** `shared-types`, `role-schema` (parser + template renderer), `provider-router` (registry + streaming adapters for Anthropic + Ollama), `telemetry-core` (cost math).
- **M3 (main process + DB):** Electron boots with context isolation, SQLite + Drizzle migrate on first run, seed creates the Strategia-X company with CEO + Senior Fullstack Engineer, keytar-backed `SecretsStore`, providers service seeds `ollama-local` + `anthropic`, dev `.env` → keychain bootstrap.
- **M4 (agent runtime):** Append-only event bus, slot-semaphore work queue, `runAgent` with live streaming + persistence, orchestrator facade, real Anthropic + Ollama adapters via Vercel AI SDK, `provider-factory` (resolves employee → provider + model with keytar + privacy-tier fallback), `role-loader` (directory scan → role.md index → template rendering), IPC handlers (`employees.list`, `chat.send`, `chat.list`) with typed preload bridge (`window.teamx: TeamXApi`), full main/index.ts wiring (orchestrator + IPC + event forwarding + graceful shutdown), test-mode provider for Playwright E2E, smoke-chat.ts script for manual Ollama verification.
- **M5 (renderer):** Tailwind + shadcn/ui dark theme, Zustand + React Query, IPC client hooks, app shell (top bar + sidenav + content area), dashboard cards view with live token stream preview, chat drawer with streaming replies + composer, hire dialog, empty/loading/error states, Inter + JetBrains Mono typography, live status counts, WCAG 2.1 AA accessibility pass.
- **M6 (demo + hardening):** Playwright E2E smoke test (full chat round-trip against canned test-mode provider), CI e2e job (ubuntu + xvfb), DevTools + will-quit shutdown fixes.

### Phase 2 (The Org) — complete

- **M7 (multi-company + workspace):** Company CRUD + soft-delete, `WorkspaceSwitcher`, `CreateCompanyDialog`, `CompanySettings` panel. DB migration adds `archived_at`, `mcp_configs_json`, `provider_prefs_json`, `max_concurrent_agents` to companies.
- **M8 (role pack system + 55 roles):** Role-loader (`listRoles()`, `listByLevel()`, `reload()`), 55 F10 roles across 6 levels (Officer 5, Senior Mgmt 7, Management 8, Supervisor 5, Lead 5, IC 25), searchable hire dialog with level filter chips.
- **M9 (org chart + hire/fire/promote):** `org_edges` table with cycle detection, `employees.fire`, `employees.promote`, `employees.setManager`, `orgchart.get` IPC channels, indented-list tree UI with color-coded levels, drag-to-rearrange, "Reports to" manager selection in hire flow.
- **M10 (MCP host + tool calling):** `McpHost` singleton with stdio/SSE connection pool, `tools_allowed`/`tools_denied` enforcement at host level, `mcp_servers` + `tool_calls` tables, streaming tool-call support via `fullStream`, 5 `mcp.*` IPC channels, default seeds (Context7, Supabase), graceful shutdown.
- **M11 (employee-to-employee messaging):** Built-in tools (`send_message_to_colleague`, `list_colleagues`), orchestrator `enqueueAgentReply` with role-relative history mapping, `is_agent_initiated` column, `ThreadList` UI with amber bot icons, read-only agent thread viewing.
- **M12 (tickets + kanban):** Ticket CRUD (`tickets` table, 8 IPC channels), 4-column kanban board (open/in-progress/blocked/done) with drag-to-move, ticket detail panel with discussion thread, create-with-assign triggers orchestrator run, `CreateTicketDialog` with priority + assignee selection.
- **M13 (demo + hardening):** Playwright E2E ticket-flow spec (full create-assign-agent-reply round-trip, 1.8s), production build fix (`inlineDynamicImports` for `__filename`/`__dirname` collision), smoke test updated for Phase 2 badge, lint cleanup. 379 unit tests + 2 E2E passing.

### Phase 3 (The Live Cockpit) — complete

- **M14 (dashboard subviews):** 4 new subviews (Timeline, Stream, Floor, Org embed) + subtab nav in Dashboard, top bar expanded to all 8 tabs with disabled placeholders, `events.list` IPC with cursor-based pagination. 384 tests passing.
- **M15 (goals & projects):** `goals`, `projects`, `project_tickets` tables + migration. Goals repo (CRUD + recalcProgress), Projects repo (CRUD + ticket linking). 12 new IPC channels (5 goals.*, 7 projects.*). Projects kanban board (4-column drag-drop), project cards + detail panel, create project dialog. Goals subtab with progress bars, goal rows + detail panel, create goal dialog. Projects tab enabled. 412 tests passing.
- **M16 (meeting primitive):** `meetings` table + `companies.status` column + migration. Meetings repo (CRUD + lifecycle). Per-company orchestrator pause/drain (`pauseCompany`/`resumeCompany`/`isCompanyPaused`). Meeting service (callMeeting/nextTurn/interject/endMeeting with minutes generation + action item extraction). 5 new IPC channels (meetings.*). MeetingsView with list panel, detail panel, call dialog, composer. Meetings tab enabled. 441 tests passing.
- **M17 (telemetry dashboard):** 4 aggregate query methods on runs repo (companyStats, dailyUsage, employeeStats, costBreakdown). 4 telemetry IPC channels + handlers + preload bridge. Recharts integration. TelemetryView with 3 subviews: Company (summary cards + 30-day AreaCharts for tokens/cost), Employees (sortable per-employee table), Cost (PieChart by provider + BarChart by model + date range filter). Telemetry tab enabled. 456 tests passing.
- **M18 (additional providers):** 7 new provider adapters (OpenAI, Google, Groq, OpenRouter, Together, Fireworks, OpenAI-compat) in `provider-router` via AI SDK + `createOpenAI` custom baseURL pattern. Provider factory extended with 7 `buildStream` cases + default models. Providers service with add/update/remove + 6 disabled seed rows. Env-key bootstrap for 7 API keys. 5 new `providers.*` IPC channels + handlers + preload bridge. SettingsView with ProvidersSection (card grid), ProviderCard (toggle, API key input, test connection, remove), AddProviderDialog (kind picker, privacy tier, key, base URL). Settings tab enabled. 501 tests passing.
- **M19 (runtime modes + privacy):** Settings repo (key-value store with seedDefaults). Hardware profiler (CPU, RAM, GPU detection via `execFileSync` + wmic on Windows, session-cached). Strategy picker (`pickStrategy` — Auto/Hybrid/Always-On/Lean based on hardware + providers). Privacy tier types + constants (`PRIVACY_TIER_RANK`, `DEFAULT_CONCURRENCY_CAPS`, `STRATEGY_SLOTS`). 6 new `settings.*` IPC channels + handlers + preload bridge. Settings UI expanded with RuntimeSection (strategy selector + hw profile), PrivacySection (tier selector + per-provider allowed/blocked), ConcurrencySection (slot selector + per-provider caps). 530 tests passing.
- **M20 (demo + hardening):** Playwright E2E meeting-flow spec (full call-interject-end-minutes round-trip). Smoke + ticket-flow E2E specs updated for Phase 3 badge. All 3 E2E specs green. CLAUDE.md finalized for Phase 3 completion. 590 unit tests + 3 E2E specs passing.

### Phase 4 (Ship-readiness) — complete

- **M21 (file vault):** `file_vault` table + FTS5 (best-effort via `fts5-init.ts`), VaultRepo, VaultService (SHA256 integrity, text extraction), 7 IPC channels (`vault.*`), VaultView renderer with Files tab, search, detail panel. 31 tests.
- **M22 (ticket attachments):** `ticket_attachments` linking table, TicketAttachmentsRepo, 3 IPC channels (`tickets.attachFile/detachFile/listAttachments`), attachment section in ticket detail panel with vault file picker. 8 tests.
- **M23 (backup/restore):** BackupService (WAL checkpoint + DB + vault copy archive), 3 IPC channels (`backup.*`), BackupSection in Settings with create/restore/history UI. 5 tests.
- **M24 (audit log UI):** AuditRepo (read-only queries on append-only events table), 3 IPC channels (`audit.*`), AuditView with summary cards, event type filter chips, actor search, date range picker, expandable rows with payload JSON viewer, CSV/JSON export. Audit tab enabled. 16 tests.
- **M25 (cross-platform installers):** electron-builder config (NSIS/DMG/AppImage+deb), placeholder app icons, macOS entitlements, `dist`/`dist:win`/`dist:mac`/`dist:linux`/`dist:publish` scripts, UpdaterService (user-triggered only, zero phone-home) with 2 IPC channels (`updater.check`, `updater.install`), UpdaterSection in Settings UI, GitHub Actions release workflow (`release.yml` — matrix win/mac/linux, SHA256 checksums, draft release). 12 tests. 602 total.
- **M26 (documentation + landing site):** README.md (hero, features, architecture, tech stack, quickstart, testing, privacy), CONTRIBUTING.md (dev setup, coding standards, PR guidelines, role-pack contribution guide, IPC conventions), CHANGELOG.md (all 25 milestones in Keep a Changelog format), 7 user guide docs (`docs/user-guide/` — getting started, hiring, projects, vault, providers, backup, shortcuts), static landing site (`docs/site/index.html` — Tailwind CDN, dark theme, responsive, 9-feature grid, architecture diagram, quickstart).
- **M27 (final hardening + v1.0.0):** Playwright E2E `vault-backup.spec.ts` (vault upload, verify integrity, backup create, verify list), Phase 4 badge in top bar, Ed25519 role-pack signature verification (`pack-signature.ts` — generate keypair, sign, verify with 10 tests), security audit (dependency audit, IPC validation sweep, context isolation, secrets handling — all PASS), version bump 0.0.1 → 1.0.0 across all 6 packages. 612 unit tests + 4 E2E specs passing.

### Phase 5 (Intelligence Layer) — in progress

- **M28 (intelligence package + RAG foundation):** `packages/intelligence` scaffold, sqlite-vec embeddings table + migration 0008, chunker (token-aware with overlap), embedding pipeline (`buildEmbedAdapter` on the provider-router, plus a deterministic fake for tests), retriever with cosine-threshold gating, RAG settings keys. 29 tests. 641 total.
- **M29 (RAG integration into agent turns):** `resolveSystemPrompt` composes retrieved context with role-md system prompts; on-write event-bus subscriptions re-index messages + vault files; dedup via SHA256 + sliding attribution block; RAG subsection in Settings → Runtime. 27 tests. 668 total.
- **M30 (NLU engine + command palette):** LLM-backed intent classifier with strict JSON output, FTS5 + fuzzy entity resolver, slot filler, 14 structured intents + `complex_request` fallback. Command palette (`Cmd+K`) with real-time NLU display, confirmation gates for 4 destructive intents (fire / close / end-meeting / promote), command history (last 20, recall via `ArrowUp`), slash-command navigation (`/show dashboard`, etc.). 5 `command.*` IPC channels, canned-classifier `command-palette.spec.ts` E2E. 146 unit tests + 2 E2E. 819 unit / 7 E2E total. Also adds architectural invariant #11 — IPC mutations must emit bus events — after the `vault-backup.spec.ts` regression.
- **M31 (agentic loop — read-side):** M30 T4 left `complex_request` as a stub; M31 replaces it with a real ReAct-style agentic loop running on a hidden `system-agent` pseudo-employee. `is_system` column (migration 0010) + partial index, `system-agent.md` role card under `role-packs/strategia-official/roles/system/`, `ensureSystemAgent(companyId)` bootstrap; filtered out of `employees.list` / `orgchart.get` / hire + delegation pickers. `@team-x/intelligence/src/loop/` — pure ReAct scheduler, tool registry, zod-validated tool schemas, hard step/token/wall-clock budget enforcement, forward-scan brace-balanced tool-call parser with one-shot nudge recovery. `apps/desktop/src/main/services/agentic-tools.ts` — 6 read-only tools (`query_employees` / `query_tickets` / `query_projects` / `query_meetings` / `query_vault` / `query_events`) wrapping existing repos with JSON-safe `{rows, truncated}` projections, max 50 rows per call, defensive `isSystem` filter, payload summary with 200-char cap. `AgenticLoopService` front-door with `start / stop / getRun / waitForRun`, pause-aware `providerRouter.complete` wrapper polling `orchestrator.isCompanyPaused(companyId)` on every provider call, `AbortController`-driven stop with canceled-status coercion, `agent.step` / `agentic.completed` / `agentic.failed` bus events, `runs` row with kind `'agentic'`. Test seam `test-agentic-provider.ts` mirrors M30 T8's `test-classifier.ts` pattern (three-tier: `__ECHO_AGENT__:[…]` sentinel → canned per-prompt table → fallback). CommandService → AgenticLoopService wiring; `CommandHandlers.agenticLoopStart(req)` returns `{ runId, threadId }`. System-agent thread UX: Copilot Conversations section in the chat sidenav (Sparkles icon, read-only compose box), persisted step transcript rendered inline in the chat drawer. Palette step-log mode: `data-step-kind` attributes as the stable E2E selector surface, six UI states (idle / streaming / complete / canceled / error / stopped), `command.stop` IPC channel fires the AbortController. Three new clamped settings keys (`agentic_max_steps=8`, `agentic_max_tokens=8000`, `agentic_timeout_ms=120000`) with `settings.getAgentic` / `settings.setAgentic` IPC channels. `agentic-loop.spec.ts` E2E (full round-trip: canned classifier returns `complex_request` → canned provider streams plan → `query_employees` tool call → tool result → grounded answer). 139 unit tests + 1 E2E. 958 unit / 8 E2E total.

- **M32 (task planner — write-side) — complete (2026-04-16, all 11 tasks shipped):** Swaps M31's read-only tool registry for a write-side set on the same `AgenticLoopService` harness. **T0** — F1 follow-up closed: `useAgentStepStream` backfill on mount via new `command.getRunSnapshot` IPC + `AgenticLoopService.getRunSnapshot()` projection + (runId, stepIndex) dedup, so the palette step log shows every step even when the canned provider completes faster than the bus subscription attaches. **T1** — F2 follow-up closed: `useThreadList` subscribes to `agentic.completed` / `agentic.failed` and invalidates `['threads', companyId]` so Copilot Conversations populates live without manual refetch. **T2** — `apps/desktop/src/main/services/agentic-tools-write.ts`: three Tool factories (`decompose_project` for Officer/Senior-Mgmt/Management/system, `delegate_subtask` + `review_deliverable` for Management/Supervisor/Lead/system), deterministic `scoreEmployee` with locked Phase 5 §7.4 weights (0.4 role-fit + 0.3 (1-load) + 0.2 avail + 0.1 past-perf), `computeRoleFit` keyword heuristic over title+level (capabilities frontmatter deferred to M33/M34), `buildWriteSideTools` level-gated composer, in-memory `EscalationTracker`, width-compatible `WriteSideEventBus`. Tools emit `plan.proposed` / `task.delegated` / `task.escalated` / `review.requested` / `review.completed` via `bus.emit`. 25 unit tests. **T3** — `AgenticLoopService` widened with employee-aware tool-registry injection (level-gated per Phase 5 §7.1, not flat per-company): new `AgenticLoopEmployeeContext` + `AgenticLoopEmployeeLookup` types, `employeesRepo.getById` facade, `StartArgs` gains optional `employeeId` with default system-agent fallback, cross-company isolation guard, actor threaded through every identity touchpoint (members, runs row, message authors, bus events) while preserving `systemAgentId` field name on `RunState` for M31 wire-contract stability. Composition root composes `[...readSideTools, ...buildWriteSideTools(employee, ...)]` in production with `streamAgent`-wrapped `WriteSideCompleteFn`. NEW `test-agentic-tools.ts` (298 LOC) ships ECHO_WRITE_SENTINEL + per-tool canned tables + schema-identical decompose/delegate/review factories with three-tier seam mirroring `test-classifier` and `test-agentic-provider`. 11 unit tests. **T4** — Promotes `WriteSideEventType` literals into canonical `EventType` union (+6: `plan.proposed`, `plan.approved`, `task.delegated`, `task.escalated`, `review.requested`, `review.completed`). Extends `AgentStepKind` (+3: `ticket_created`, `delegation_made`, `review_pending`). Six JSON-safe payload types in `packages/shared-types/src/events.ts`. T2 string-literal immunity preserved. 3 type-level tests. **T5** — Write-side confirmation gate (Gate 2.5) in `command-service.ts` for `complex_request` intents matching `WRITE_SIDE_KEYWORDS` regex (decompose / delegate / create tickets / review). Returns `{ kind: 'needs_confirmation', gateKind: 'write-side', summary }` rendered as an **amber** card distinct from the M30 destructive **red** card. `skipConfirmation: true` opt-out for M33 Copilot. 8 unit tests. **T6** — Full step-card variants: `ticket_created` (emerald, Ticket icon), `delegation_made` (sky, GitBranch), `review_pending` (color-coded by outcome). Narrow helpers extracted to `step-card-narrow.ts` for testability without renderer deps. AuditView gains 6 planner event chips with payload-aware row summaries. 11 unit tests. **T7** — Four new clamped planner settings keys (`planner_max_tickets` 1-50 default 10, `planner_max_depth` 1-4 default 2, `planner_approval_level` enum default `management`, `planner_escalation_threshold` 1-10 default 3) with `settings.getPlanner` / `settings.setPlanner` IPC channels and PlannerSection UI in Settings → Runtime. Composition root wires `settingsRepo.getPlanner()` into `writeSideDeps.getPlanner` replacing static `PLANNER_DEFAULTS`. 11 unit tests. **T8** — `task-planner.spec.ts` E2E (full round-trip: canned classifier returns `complex_request` for "decompose the frontend redesign into tickets" → amber write-side gate fires → Confirm dispatches → canned provider scripts plan → `decompose_project` → `delegate_subtask` → grounded answer; asserts palette step log via `data-step-kind`, destructive gate ABSENT, persisted Copilot transcript, Dashboard audit row). 9 of 9 E2E specs green in 26.4s. **T9** — docs (CLAUDE.md / CHANGELOG / README / `docs/user-guide/task-planner.md` NEW / Phase 5 design-doc §9 update). **T10** — verification + milestone marker (commit `75040ed`).

- **M33 (Copilot Service — periodic analyzer + proactive insights + ask-the-copilot) — complete (2026-04-17, all 11 tasks shipped):** Turns the M31 agentic harness inside-out. Instead of a human prompting the loop, the **app itself** prompts the loop on a 5-minute cadence (clamped 1–60 min), asks *"what's wrong with this company right now?"*, and surfaces the answer as **insights** — proactive nudges about blocked tickets, cost spikes, org gaps, workflow drift. Five categories (`operational` / `cost` / `org` / `workflow` / `anomaly`), three severities (`info` / `warning` / `critical`). **T1** — Migration 0011 `copilot_insights` table (CHECK-constrained category + severity, composite `idx_insights_company_active`, FK CASCADE) + `CopilotInsightsRepo` with deterministic `upsertWithDedup` (category scope → numeric-drift guard → Jaccard bigram > 0.8). **T2** — `system-copilot` pseudo-employee (second `is_system=1` row per company alongside M31's `system-agent`), `role-packs/strategia-official/roles/system/system-copilot.md` role card, `tools_allowed` scoped to M31 read-only set + `query_copilot_insights`, `tools_denied` locks out planner write-tools and shell/filesystem/network. NEW `packages/shared-types/src/roles.ts` exports `SYSTEM_AGENT_ROLE_ID` + `SYSTEM_COPILOT_ROLE_ID` + `isSystemRoleId()` predicate. Filter sweep auto-covered by `is_system=1` + `level='system'`. **T3** — `CopilotEventWindow`: in-memory bounded deque (100 events/company, FIFO eviction, `token.delta` filtered, warm-start hydration from `events.list`). **T4** — Headline task. `CopilotAnalyzerService` (periodic scheduler + LLM + dedup + expiry) with deterministic prompt builder (≤2000 event-summary chars), Zod `InsightDraftSchema` + one-shot nudge retry + `malformed_output` skip, pause-aware `providerRouter.complete` wrapper (actor: `system-copilot`), per-cycle expiry sweep, runs-table row per tick with `kind: 'copilot'`. Separate `CopilotEventTrigger` with 30s-debounced per-company `triggerAnalysis` for `meeting.ended` / `ticket.closed` / `goal.progressChanged` / `agentic.failed { budget_exhausted }` (debounce not throttle — timer resets, latest-reason wins). Migration 0012 adds `runs.kind` column. Three new event types (`copilot.insight` / `copilot.analyzed` / `copilot.expired`) + `CopilotCategory` / `CopilotSeverity` / `CopilotAnalyzedReason` unions in shared-types. **T5** — Four `copilot.*` IPC channels (`insights` / `dismiss` / `ask` / `configure`) typed end-to-end via `TeamXApi` + `IpcContract`. NEW `ipc/copilot-handlers.ts` `buildCopilotHandlers` factory (rag-handlers pattern). NEW `shared-types/src/copilot.ts` JSON-safe `CopilotInsight` wire type. `copilot.dismissed` event appended. `window.teamx.copilot` namespace on preload. **T6** — `copilot.ask` routing through `AgenticLoopService.start` with `employeeId = system-copilot`. NEW `services/agentic-tools-copilot.ts` — `query_copilot_insights` Tool factory (zod-strict, `{rows, truncated}` envelope, 50-row cap, `includeDismissed` flag) + `buildCopilotToolRegistry` level-gated composer. NEW `services/copilot-service.ts` `CopilotService` front-door wrapping `AgenticLoopService.start`; resolves per-company `system-copilot` via `employeesRepo.findSystemByRoleId`; returns `{ runId, threadId }` matching M31 `IpcExecuteResult.complex_request` shape for M34 sidebar wire-contract stability. **T7** — Three clamped copilot settings keys wired end-to-end (`copilot_enabled` bool/true, `copilot_interval_minutes` 1–60/5, `copilot_categories` subset/full-default) with `settings.getCopilot` / `settings.setCopilot` IPC channels and `CopilotSection` UI in Settings → Runtime. `setCopilot` triggers `analyzer.restart(companyId)` so the per-company timer picks up the new interval without app restart. **T8** — Fourth member of the agentic-surface test-seam quartet. NEW `apps/desktop/src/main/services/test-copilot-provider.ts` — three-tier canned lookup (`__ECHO_COPILOT__:<json>` sentinel → normalized-substring match against `inlineFixtures` → `runtimeFixtures` Map → frozen `CANNED_COPILOT_TABLE` → `FIXTURE_COPILOT_EMPTY` never-throw fallback). Composition root replaces T4 inline placeholder in test-mode `resolveComplete` branch with `createTestCopilotComplete()`. **T9** — `copilot-service.spec.ts` E2E (full round-trip: `tickets.create + close` → `copilot.configure` manual-tick → assert `insightsGenerated ≥ 1` → `copilot.insights` capture id → `copilot.dismiss` → assert `dismissedAt` + `events.list` contains `copilot.dismissed` (invariant #11 regression guard) → `copilot.ask` with `__ECHO_AGENT__:` sentinel → poll `command.getRunSnapshot` for terminal answer + assert `tool_call(query_copilot_insights)` step → `chat.list(threadId) ≥ 2` messages → `chat.listThreads` asserts `isSystemAgent: true` on copilot thread → regression guards: destructive gate + write-side gate both ABSENT). Spec runtime 1.7s. E2E 9 specs / 10 cases green. **T10** — Documentation (CLAUDE.md / CHANGELOG / README / Phase 5 design §9 / `docs/user-guide/copilot-service.md` NEW) + verification + milestone marker.

The Phase 1 plan lives at [`docs/plans/2026-04-07-team-x-phase-1-skeleton.md`](docs/plans/2026-04-07-team-x-phase-1-skeleton.md).
The Phase 2 plan lives at [`docs/plans/2026-04-11-team-x-phase-2-the-org.md`](docs/plans/2026-04-11-team-x-phase-2-the-org.md).
The Phase 3 plan lives at [`docs/plans/2026-04-12-team-x-phase-3-live-cockpit.md`](docs/plans/2026-04-12-team-x-phase-3-live-cockpit.md).
The Phase 4 plan lives at [`docs/plans/2026-04-13-team-x-phase-4-ship-readiness.md`](docs/plans/2026-04-13-team-x-phase-4-ship-readiness.md).
The Phase 5 design lives at [`docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`](docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md); the M31 implementation plan lives at [`docs/plans/2026-04-14-team-x-phase-5-m31-agentic-loop.md`](docs/plans/2026-04-14-team-x-phase-5-m31-agentic-loop.md); the M32 implementation plan lives at [`docs/plans/2026-04-15-team-x-phase-5-m32-task-planner.md`](docs/plans/2026-04-15-team-x-phase-5-m32-task-planner.md); the M33 implementation plan lives at [`docs/plans/2026-04-16-team-x-phase-5-m33-copilot-service.md`](docs/plans/2026-04-16-team-x-phase-5-m33-copilot-service.md).

## Stack (locked)

| Layer | Choice |
|---|---|
| Desktop shell | Electron |
| Build | electron-vite + electron-builder |
| Main process | Node.js 20 LTS + TypeScript (strict) |
| Renderer | React 19 + TypeScript + Tailwind + shadcn/ui + Radix |
| State | Zustand + React Query |
| LLM layer | Vercel AI SDK (`ai`) + provider packages |
| Agent framework | Custom orchestrator on top of AI SDK |
| MCP | `@modelcontextprotocol/sdk` (TypeScript) |
| Database | better-sqlite3 + Drizzle ORM |
| Vector store | sqlite-vec |
| Full-text search | SQLite FTS5 |
| Secrets | keytar (OS keychain) |
| Package manager | pnpm workspaces |
| Lint / format | Biome |
| Unit tests | Vitest |
| E2E tests | Playwright |
| CI | GitHub Actions |
| License | MIT |

Do NOT swap any of these without revisiting the design doc with the user first.

## Repository layout (planned)

```
Team-X/
├─ apps/desktop/           # Electron app (main + preload + renderer)
├─ packages/               # shared-types, role-schema, provider-router, mcp-client, telemetry-core
├─ role-packs/             # default F10 pack + community packs
├─ docs/                   # plans, architecture, user-guide
├─ scripts/
├─ .github/workflows/
├─ CLAUDE.md
├─ README.md               # phase 4
├─ LICENSE                 # MIT (phase 4)
└─ package.json            # pnpm workspace root
```

## Phase plan (locked)

1. **Phase 1 — Skeleton** — Electron boot, SQLite, 1 hardcoded company, CEO + 1 SWE, AI SDK + Anthropic + Ollama, bare Cards dashboard with live token stream. Demo: *"Hire a CEO, chat with it, watch it think."*
2. **Phase 2 — The Org** — Role pack loader + 55 roles, multi-company, org chart editor, MCP host, tickets + kanban. Demo: *"File a ticket → agent picks it up, uses an MCP, closes it."*
3. **Phase 3 — The Live Cockpit** — All 5 dashboard subviews, meeting primitive, goals + projects, telemetry, runtime modes, privacy tier filter. Demo: *"One-click all-hands → minutes → action items → tickets."*
4. **Phase 4 — Ship-readiness** — File vault, backup/restore, audit log UI, installers, landing site, public release.
5. **Phase 5 — Intelligence Layer** — `packages/intelligence` (RAG + NLU + agentic loop), command palette, system-agent pseudo-employee, write-side task planner, in-app copilot. Demo: *"Ask `Cmd+K` — 'why is the frontend team behind?' — get a grounded multi-paragraph answer citing specific tickets, employees, and events."*

## Build commands

**Install and run:**

```bash
pnpm install                    # install workspace deps (runs electron-rebuild postinstall)
pnpm dev                        # electron-vite dev server (main + renderer HMR)
pnpm -F @team-x/desktop dev     # same, scoped to the desktop app
pnpm build                      # production build of all workspaces
```

**Packaged installers (Phase 4 — M25):**

```bash
pnpm dist                       # build + package for current platform
pnpm dist:win                   # Windows NSIS installer (x64 + arm64)
pnpm dist:mac                   # macOS DMG (x64 + arm64)
pnpm dist:linux                 # Linux AppImage + deb (x64)
pnpm dist:publish               # build + upload to GitHub Release draft
```

Output lands in `release/<version>/`. Playwright E2E tests are wired (T49) and run via `pnpm -F @team-x/desktop test:e2e`.

**Test, typecheck, lint:**

```bash
pnpm test                       # vitest run across all workspaces (602 tests)
pnpm test:watch                 # vitest in watch mode
pnpm test:coverage              # vitest with coverage report
pnpm typecheck                  # tsc --noEmit across all workspaces
pnpm lint                       # biome check
pnpm lint:fix                   # biome check --write
pnpm format                     # biome format --write
```

**End-to-end smoke test (Playwright + real Electron):**

```bash
# Full build + run — what CI does and what you should run before /ship.
pnpm -F @team-x/desktop test:e2e

# Skip the build (faster iteration when out/main is already current).
pnpm -F @team-x/desktop test:e2e:run
```

Three E2E specs live under `apps/desktop/e2e/`:

- `smoke.spec.ts` — Phase 1 chat round-trip (boot, render employees, send message, canned reply).
- `ticket-flow.spec.ts` — Phase 2 ticket lifecycle (navigate to Tickets, create ticket with assignee, agent processes via test-mode provider, verify reply in detail panel).
- `meeting-flow.spec.ts` — Phase 3 meeting lifecycle (navigate to Meetings, call meeting with attendees, Rocky interjects, end meeting, verify minutes generation).

All three launch a real Electron instance against `out/main/index.js` with
`NODE_ENV=test`, which flips `provider-factory.isTestMode()` to `true`
and swaps the resolver for the canned-reply `createTestModeResolveProvider`.
No Ollama, no Anthropic key, no network — the full round-trips are
exercised through the orchestrator and event bus end-to-end.

Each run gets its own throwaway `--user-data-dir=<tmp>` so the test
SQLite database never collides with Rocky's real dev DB at
`%APPDATA%/Team-X/team-x/team-x.sqlite`.

**Manual smoke against a real local LLM (Ollama):**

```bash
pnpm -F @team-x/desktop exec tsx scripts/smoke-chat.ts
```

Requires `ollama serve` running locally with `llama3.1:8b` (or whatever
you set as `modelPref`) pulled. Streams a real response to stdout —
the fastest way to verify the orchestrator + provider router pipeline
end-to-end without booting Electron.

**Typecheck caveat — important.** Always run `pnpm typecheck` at the repo root (which expands to `pnpm -r typecheck`). The workspace-scoped `pnpm -F @team-x/desktop typecheck` does NOT traverse project references and silently misses per-package composite-mode regressions in the shared workspace packages. This cost real debugging time in Task 18 — do not shortcut it.

**Database migrations (Drizzle):**

```bash
pnpm -F @team-x/desktop exec drizzle-kit generate --name <snake_case_name>
```

Emits a new migration to `apps/desktop/src/main/db/migrations/`. Commit the resulting `.sql` file along with the updated `meta/_journal.json` and `meta/*_snapshot.json` that drizzle-kit writes alongside it.

**Native module rebuilds:**

```bash
pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar
```

Rebuilds both native modules against Electron's ABI. **Use the comma-separated form** for multi-module rebuilds — `@electron/rebuild@3.7.2`'s CLI crashes with `argv.w.split is not a function` on repeated `-w` flags (it calls `.split(',')` on the value internally). When adding a new native module, extend the comma list, not a second `-w` flag. The `@team-x/desktop` postinstall script already uses this form; mirror it if you script a rebuild elsewhere.

## Architectural invariants

These are non-negotiable. Violating any of them requires a design-doc amendment.

1. **Renderer is a pure view.** No direct LLM or MCP calls. Every interaction crosses the typed IPC bridge into Main. Context isolation on. No node integration in renderer.
2. **Orchestrator is the only scheduler.** If the orchestrator says pause (e.g., during a meeting), nothing new dispatches. This keeps the meeting primitive race-free.
3. **MCP Host is a singleton in Main.** One pool of MCP connections; agents request tool calls via message passing. Never spawn N MCP clients from N workers.
4. **Storage is SQLite + filesystem vault.** Metadata in SQLite, blobs on disk, SHA256 integrity. **Never** store file blobs in SQLite — that breaks the zero-file-size-limit guarantee.
5. **Provider router is the only place that touches LLM APIs.** It enforces privacy tiers, concurrency caps, and cost tracking.
6. **Events table is append-only.** Source of truth for the realtime dashboard. Orchestrator writes; renderer subscribes.
7. **Zero phone-home.** Ever. No anonymized metrics. Updates are explicitly user-triggered. This is the privacy-first posture and it does not get traded away.
8. **Secrets live in the OS keychain** (keytar). Never plaintext in config files.
9. **Role-pack user edits are saved as overrides**, not mutations of the pack. Upstream pack updates must never clobber user customizations.
10. **Runtime strategy is adaptive.** Default Auto; profile hardware + providers on startup; pick Hybrid / Always-On / Lean. User override always wins.
11. **IPC channels that mutate state must emit a bus event.** Renderer-side caches subscribe to the bus for invalidation; IPC alone is not enough because E2E specs and programmatic callers bypass React Query. This was the root cause of the vault-backup.spec.ts regression (findings: `docs/plans/2026-04-13-vault-backup-regression-findings.md` §7).

## Working with role packs

The curated F10 role library is the crown jewel. When creating or editing `role.md` files in `role-packs/strategia-official/`:

- **Match the quality bar** of `~/.claude/CLAUDE.md` and Rocky's Strategia-X writing voice: executive, authoritative, direct, F10. No marketing fluff.
- **Always include** the full frontmatter: `id`, `name`, `level`, `reports_to`, `manages`, `preferred_model_tier`, `preferred_providers`, `fallback_providers`, `tools_allowed`, `tools_denied`, `decision_authority`, `kpis`, `output_format`, `temperature`, `license`, `author`, `version`.
- **Use template variables** (`{{company.name}}`, `{{company.mission}}`, `{{employee.name}}`, etc.) so one role.md serves many companies.
- **Structure the body** with: `# Identity`, `# Mission`, `# Responsibilities`, `# Decision Framework`, `# Communication Style`, `# Escalation Rules`, `# Output Format`.
- **Version bumps** follow semver. Breaking changes to frontmatter keys are major bumps.

## Working with providers & models

- **Never hardcode model names** in code. Models live in the `model_registry` table, populated from a versioned JSON manifest that ships with role packs and can be updated independently.
- **Respect privacy tiers.** Every provider has `privacy_tier ∈ { local, open-source-cloud, proprietary-cloud }`. The provider router enforces the user's privacy filter at call time. If a role requests a provider the filter blocks, fall back per `fallback_providers`.
- **Respect per-provider concurrency caps** defined in settings. Defaults: ollama=1, anthropic=4, openai=6, openrouter=8, groq=10, together=6, fireworks=6, google=4.
- **Track every call** in the `runs` table with provider, model, tokens, latency, cost. Cost telemetry is user-visible in the Telemetry tab.

## Security posture (public-release grade from day one)

- Context isolation + disabled node integration in renderer.
- All IPC typed via preload bridge; no `ipcRenderer` exposed.
- API keys in OS keychain.
- MCP `tools_denied` enforced at the host, not in the agent prompt.
- Community role packs require signature verification (phase 4+).
- Append-only audit log in `events` table for every sensitive action (hire, fire, MCP add, backup restore).

## Testing expectations

- **Unit tests (Vitest)** for: role.md parser, provider router logic, orchestrator scheduler math, telemetry calculations, backup/restore round-trip.
- **Integration tests (Vitest)** for: MCP host + one real MCP, Drizzle migrations, worker lifecycle, meeting pause/resume.
- **E2E tests (Playwright)** for: hire flow, chat flow, ticket assign → close flow, meeting flow, backup/restore flow, RAG flow, command palette flow. Seven specs ship today: smoke, ticket-flow, meeting-flow, vault-backup, rag-flow, command-palette, plus the Phase 4 baseline. All run against the canned test-mode provider (and canned classifier for command-palette).
- Every Phase-X demo must have green tests before the phase is marked shippable.

## IPC channels (Phase 2 + Phase 3 + Phase 5)

All channels are typed via `TeamXApi` in `packages/shared-types/src/ipc.ts` and exposed through the preload bridge.

| Namespace | Channel | Description |
|-----------|---------|-------------|
| companies | `companies.create` | Create new company |
| | `companies.update` | Update company settings |
| | `companies.delete` | Soft-delete (archive) company |
| employees | `employees.list` | List employees for company |
| | `employees.create` | Hire from role catalog |
| | `employees.fire` | Archive employee |
| | `employees.promote` | Change role/level |
| | `employees.setManager` | Update reporting line |
| orgchart | `orgchart.get` | Get full org tree for company |
| chat | `chat.send` | Send message to employee |
| | `chat.list` | List messages in thread |
| | `chat.resolveThread` | Get or create DM thread |
| | `chat.listThreads` | List all threads for company |
| events | `events.list` | Paginated event list for timeline (M14) |
| mcp | `mcp.list` | List MCP servers for company |
| | `mcp.add` | Register new MCP server |
| | `mcp.remove` | Remove MCP server |
| | `mcp.toggle` | Enable/disable MCP server |
| | `mcp.health` | Check MCP server health |
| goals | `goals.create` | Create company goal (M15) |
| | `goals.update` | Update goal fields |
| | `goals.list` | List all goals for company |
| | `goals.get` | Goal detail with linked projects |
| | `goals.delete` | Delete a goal |
| projects | `projects.create` | Create project (M15) |
| | `projects.update` | Update project fields |
| | `projects.list` | List all projects for company |
| | `projects.get` | Project detail with tickets + lead |
| | `projects.delete` | Delete project + ticket links |
| | `projects.linkTicket` | Link ticket to project |
| | `projects.unlinkTicket` | Unlink ticket from project |
| meetings | `meetings.call` | Start a meeting (pause orchestrator, create thread) (M16) |
| | `meetings.end` | End meeting, generate minutes, resume orchestrator |
| | `meetings.interject` | Rocky sends a message mid-meeting |
| | `meetings.list` | List past meetings for company |
| | `meetings.get` | Get meeting detail with thread + minutes |
| telemetry | `telemetry.companyStats` | Aggregate company-level stats (M17) |
| | `telemetry.dailyUsage` | Daily time-series of tokens + cost |
| | `telemetry.employeeStats` | Per-employee breakdown |
| | `telemetry.costBreakdown` | Cost by provider/model with date range |
| settings | `settings.getRuntime` | Strategy + hardware profile + effective slots (M19) |
| | `settings.setRuntime` | Set runtime strategy override |
| | `settings.getPrivacy` | Privacy tier + per-provider allowed/blocked |
| | `settings.setPrivacy` | Set max privacy tier |
| | `settings.getConcurrency` | Orchestrator slots + per-provider caps |
| | `settings.setConcurrency` | Update slots + caps |
| | `settings.getAgentic` | Agentic loop budget caps (`agentic_max_steps`, `agentic_max_tokens`, `agentic_timeout_ms`) (M31) |
| | `settings.setAgentic` | Update clamped agentic-loop budget caps |
| | `settings.getPlanner` | Task planner caps (`planner_max_tickets`, `planner_max_depth`, `planner_approval_level`, `planner_escalation_threshold`) (M32) |
| | `settings.setPlanner` | Update clamped task-planner caps |
| | `settings.getCopilot` | Copilot service settings (`copilot_enabled`, `copilot_interval_minutes`, `copilot_categories`) (M33) |
| | `settings.setCopilot` | Update clamped copilot settings; triggers `analyzer.restart(companyId)` so the per-company timer picks up the new interval without app restart |
| copilot | `copilot.insights` | Active insights for company (newest-first, optional category/severity filters, limit clamped 1–100) (M33) |
| | `copilot.dismiss` | Mark an insight as dismissed (`dismissedAt = Date.now()`); emits `copilot.dismissed` on the bus (invariant #11) |
| | `copilot.ask` | Free-form question to copilot — routes through M31 agentic harness with `system-copilot` actor + `query_copilot_insights` introspection tool. Returns `{ runId, threadId }` matching M31 `complex_request` shape |
| | `copilot.configure` | Test-only manual-tick IPC (gated on `isTestMode()`). Production uses `settings.setCopilot` to update cadence; this fires a single tick synchronously with `{ insightsGenerated }` return |
| providers | `providers.list` | List all configured providers (M18) |
| | `providers.add` | Register a new provider (API key to keychain) |
| | `providers.update` | Update config, toggle, set API key |
| | `providers.remove` | Remove provider + keychain entry |
| | `providers.testConnection` | Test provider API key + connectivity |
| tickets | `tickets.create` | File ticket (optional immediate assign) |
| | `tickets.update` | Update mutable fields |
| | `tickets.assign` | Assign + create thread + enqueue agent |
| | `tickets.close` | Close ticket (status → done) |
| | `tickets.reopen` | Reopen closed ticket |
| | `tickets.addComment` | Add discussion comment (triggers agent) |
| | `tickets.list` | List all tickets for company |
| | `tickets.get` | Full detail with messages + assignee |
| audit | `audit.list` | Filtered, paginated audit event list (M24) |
| | `audit.stats` | Aggregate statistics for summary cards |
| | `audit.export` | Export filtered events to CSV/JSON file |
| updater | `updater.check` | Check GitHub Releases for newer version (M25) |
| | `updater.install` | Download and install update (app restarts) |
| command | `command.parse` | Classify user text into an intent + entities + confidence (M30) |
| | `command.execute` | Run a parsed intent (destructive intents require `confirmed: true`) |
| | `command.history` | Last N commands (cap 20, newest-first) |
| | `command.suggest` | Partial-text suggestions for autocomplete |
| | `command.stop` | Cancel an in-flight agentic-loop run (fires `AbortController`; terminal step is emitted as `canceled`) (M31) |
| | `command.getRunSnapshot` | Backfill projection (`runId, threadId, steps[]`) for `useAgentStepStream` on mount — closes M31 F1 (M32 T0) |

**Bus events added in Phase 5 (not IPC — append-only on the `events` table, consumed by the renderer via the event bus):**

| Event | Emitted by | Milestone | Payload shape |
|-------|------------|-----------|---------------|
| `rag.index.*` | `rag-indexer.ts` | M28/M29 | `{ companyId, sourceKind, sourceId, chunkCount }` and friends for on-write embedding |
| `command.executed` | `CommandService` | M30 | `{ companyId, intent, entities, result, durationMs }` — audit-loggable |
| `agent.step` | `AgenticLoopService` | M31 | `{ runId, threadId, step: { kind: 'plan' \| 'tool_call' \| 'tool_result' \| 'answer' \| 'error', … } }` |
| `agentic.completed` | `AgenticLoopService` | M31 | `{ runId, threadId, finalAnswer, stepCount, tokensUsed, durationMs }` |
| `agentic.failed` | `AgenticLoopService` | M31 | `{ runId, threadId, reason: 'budget_exhausted' \| 'timeout' \| 'canceled' \| 'provider_error' \| 'tool_error', detail? }` |
| `plan.proposed` | `agentic-tools-write.ts` (`decompose_project`) | M32 | `{ companyId, planId, projectId, subtasks: [{ id, title, recommendedAssigneeId, score }], truncated }` |
| `plan.approved` | `agentic-tools-write.ts` | M32 | `{ companyId, planId, approvedBy, approvedAt }` (M33 prep — emitted only when explicit approval lands) |
| `task.delegated` | `agentic-tools-write.ts` (`delegate_subtask`) | M32 | `{ companyId, ticketId, planId, subtaskId, assigneeId, score, attempts, fallbackChain }` |
| `task.escalated` | `agentic-tools-write.ts` (`delegate_subtask`) | M32 | `{ companyId, planId, subtaskId, reason: 'fallback_chain_exhausted' \| 'repeated_rejects', original }` |
| `review.requested` | `agentic-tools-write.ts` (`review_deliverable`) | M32 | `{ companyId, ticketId, reviewerId, requestedAt }` |
| `review.completed` | `agentic-tools-write.ts` (`review_deliverable`) | M32 | `{ companyId, ticketId, reviewerId, outcome: 'approve' \| 'reject', note?, escalated? }` |
| `copilot.analyzed` | `CopilotAnalyzerService` (per tick) | M33 | `{ companyId, reason: 'periodic' \| 'manual' \| 'event' \| 'malformed_output', durationMs, insightsProposed, insightsPersisted, insightsMerged, insightsExpired }` |
| `copilot.insight` | `CopilotAnalyzerService` (per insert, NOT per merge) | M33 | `{ companyId, insightId, category, severity, title }` |
| `copilot.dismissed` | `copilot.dismiss` IPC handler | M33 | `{ companyId, insightId, dismissedAt }` |
| `copilot.expired` | `CopilotAnalyzerService` (per expiry-sweep row) | M33 | `{ companyId, insightId, category, severity, title, expiredAt }` |

## Troubleshooting

**`Cannot find module '...better_sqlite3.node'` or any native-module ABI mismatch.** Electron rebuilds against its own Node ABI; pnpm installs against the system Node. Run the rebuild after every dep change that touches native modules:

```bash
pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar
```

The `@team-x/desktop` postinstall script does this automatically on `pnpm install`. If you're seeing the error after a dep upgrade, it usually means the postinstall hook was skipped — re-run install with `--force`.

**Ollama smoke chat fails with `ECONNREFUSED 127.0.0.1:11434`.** Ollama isn't running. Start it (`ollama serve` on Linux/macOS, or open the Ollama desktop app on Windows) and re-run. Confirm the model is pulled:

```bash
ollama list
ollama pull llama3.1:8b   # or whatever the test references
```

If Ollama is bound to a non-default host, set `OLLAMA_BASE_URL` in `apps/desktop/.env` — see `bootstrapEnvKeys` for the full env-key import contract.

**Drizzle migrations are out of sync — "table already exists" or "missing column" on dev boot.** The dev DB lives at `%APPDATA%/Team-X/team-x/team-x.sqlite` on Windows. Nuke it and let the next boot reseed:

```bash
# Windows (PowerShell)
Remove-Item -Force "$env:APPDATA\Team-X\team-x\team-x.sqlite*"

# macOS / Linux equivalent
rm -f ~/Library/Application\ Support/Team-X/team-x/team-x.sqlite*
```

The `*` glob also removes the `-shm` and `-wal` WAL companion files. On the next `pnpm dev`, migrations re-run from scratch and `seedIfEmpty()` reseeds the Strategia-X company + CEO + SWE.

**Playwright E2E hangs at the 90s test timeout.** The smoke test is supposed to finish in ~1-2 seconds. A hang means one of the assertions is waiting on an element that never appears. Things to check, in order:

1. The renderer crashed silently — read the `[renderer pageerror]` and `[renderer error]` lines forwarded by `e2e/smoke.spec.ts`.
2. A locator regex doesn't match the entire accessible name — Playwright's `getByRole({ name: regex })` is anchored, so use attribute-starts-with selectors (`button[aria-label^="..."]`) for robust matches.
3. `app.close()` itself is hanging — the will-quit handler in `main/index.ts` calls `app.exit(0)` after the orchestrator drains; if that ever stops working, the afterEach will force-kill after 5s and the test will surface the real assertion that failed before the hang.

**`pnpm typecheck` passes but unit tests fail with "test is not defined".** Vitest is picking up an `e2e/*.spec.ts` Playwright file. Confirm `apps/desktop/vitest.config.ts` excludes `e2e/**` — the per-workspace exclude is required because `vitest.workspace.ts` resolves projects independently and the root `vitest.config.ts` exclude does not propagate down.

**DevTools auto-opens during the Playwright run and the test hangs.** Should not happen — `main/index.ts` gates `openDevTools` on `process.env.NODE_ENV !== 'test'`. If the gate ever regresses, DevTools and Playwright fight over the same Chrome DevTools Protocol channel and every `expect().toBeVisible()` hangs indefinitely.

**Production build fails with `__filename has already been declared`.** The `electron.vite.config.ts` injects an ESM `__filename`/`__dirname` shim as a banner. If Rollup code-splits into chunks, each chunk gets its own CJS shim from electron-vite, colliding with the banner. The fix: `inlineDynamicImports: true` in the main build output config forces a single-file bundle. This is the correct shape for an Electron main process with one entry point.

**Ticket-flow E2E fails with strict mode violation on `getByText`.** Ticket description text appears in multiple DOM nodes (kanban card, detail panel description, initial thread message). Scope locators to a container: `detailPanel.locator('p').filter({ hasText: desc })` targets only the description paragraph, not the message `<div>`.

**MCP servers fail to connect in dev.** MCP servers are seeded as templates (`enabled: false`) by default. Enable them via the Company Settings panel or directly in the `mcp_servers` table. Verify the MCP binary is on the PATH. Check `[mcp]` prefixed logs in the main process console.

**Meeting-flow E2E fails with strict mode violation.** Meeting agenda text appears in multiple DOM nodes (detail panel `<h3>` header + system message `<p>`). Scope locators to specific tags: `detailPanel.locator('h3').filter({ hasText: agenda })` for the header, `detailPanel.locator('p.italic')` for system messages. The "Minutes" label also collides with "Meeting Minutes" content — use `getByText('Minutes', { exact: true })` and `locator('div.max-h-32')` for the content.

**Meeting interject not appearing in thread.** The meeting detail panel polls every 2s via `useMeetingDetail` refetchInterval. If an interjection doesn't appear, check that the `meetings.interject` IPC handler is registered and that the meeting status is still `'active'`. Ended meetings reject interjections with an error.

**Runtime strategy shows "Unknown" in Settings.** The hardware profiler runs `wmic` commands on Windows via `execFileSync`. If `wmic` is not on PATH (rare on Windows 11), GPU detection fails silently and defaults to conservative values. The strategy picker still works — it just assumes no GPU.

**Telemetry charts show no data.** Telemetry reads from the `runs` table. If no agent runs have completed, all charts render zeros. Trigger a chat or ticket assignment to populate the runs table, then refresh the Telemetry tab.

**`pnpm dist` fails with native module errors.** electron-builder needs native modules rebuilt for the target Electron ABI. Run `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar` first. If packaging for a different platform (cross-compilation), native modules must be built on the target OS — use the GitHub Actions release workflow instead.

**Updater shows "not available" in dev.** By design. The UpdaterService returns a no-op in dev and test mode (invariant #7: zero phone-home). The real updater only activates in packaged production builds where `app.isPackaged` is true.

**Agentic loop terminates immediately with `budget_exhausted` or `timeout`.** The three clamps live in `settings` (`agentic_max_steps` default 8, `agentic_max_tokens` default 8000, `agentic_timeout_ms` default 120000). Small local models frequently burn the step budget on malformed tool-call parsing — the M31 T1 parser grants one nudge-retry per malformed step and then counts the step. Bump `agentic_max_steps` to 12 or 16 for 7–8B local models, or switch to a larger model / cloud provider via Settings → Providers. If the loop is exhausting `agentic_max_tokens` before producing an answer, the `query_*` tools are returning too-wide projections — confirm no single tool call exceeds the 50-row cap (the envelope is `{rows, truncated}`; `truncated: true` is a signal to narrow the query).

**Agentic loop step cards only show the final answer in the palette, not intermediate steps.** RESOLVED in M32 T0 (commit `f515ea7`). `useAgentStepStream` now backfills via `command.getRunSnapshot` on mount before attaching the bus listener, with `(runId, stepIndex)` dedup against late-arriving bus events. If you still see only the answer card, confirm `out/main` is up to date (rebuild after a pnpm install / git pull) and that the renderer's `command.getRunSnapshot` IPC roundtrip is firing — check the `[ipc] command.getRunSnapshot` log line in the main-process console.

**System-agent thread doesn't appear in Copilot Conversations right after a complex_request.** RESOLVED in M32 T1 (commit `62a0504`). `useThreadList` now subscribes to `agentic.completed` and `agentic.failed` and invalidates `['threads', companyId]` on either event. If the thread list still shows stale data, confirm the bus listener is wired (the dashboard bus is a singleton — a stale React Strict Mode double-mount can lose the subscription); a hard reload (`Ctrl+R` in dev, restart the app in prod) rewires it.

**Agentic loop fires during a meeting and the user sees stale progress.** By design, not a bug — `AgenticLoopService.start()` observes `orchestrator.isCompanyPaused(companyId)` via a polling wrapper around `providerRouter.complete` (poll interval 250ms prod, 2ms test). The loop queues until the meeting ends, then resumes. The palette stays responsive; the step log shows a single plan card and then idles. Nothing is dropped.

**System-agent missing from a company after restore from backup.** The M23 backup/restore path was ship-final in Phase 4 and predates the `is_system` column (migration 0010). Restoring a pre-M31 backup leaves no system-agent row. Fix: delete the `team-x.sqlite` file and let `seedIfEmpty` re-bootstrap, then manually re-import any thread data — or open a ticket to add a `backupService.ensurePostRestoreSystemAgents()` pass. Not currently gating any planned milestone.

**`agentic-loop.spec.ts` hangs with "timed out waiting for `data-step-kind='answer'`".** The canned provider seam (`test-agentic-provider.ts`) is a three-tier lookup: the `__ECHO_AGENT__:[…]` JSON sentinel first, then the canned per-prompt table, then a generic fallback. If the spec was recently extended with a new prompt that doesn't match any key in `test-agentic-provider.ts` or `test-agentic-tools.ts`, the fallback path runs and can take minutes. Add the prompt key to both seams in lockstep — the rule is any new agentic surface must ship a matching test-side swap (T8 pattern).

**Task Planner: amber confirmation gate never appeared even though my prompt looks write-shaped.** The `WRITE_SIDE_KEYWORDS` regex in `command-service.ts` only catches the locked verbs (*decompose* / *delegate* / *create tickets* / *assign owners* / *review*). Synonyms like "break down", "hand off", "file tickets" don't match — the prompt routes to the M31 read-side loop and runs without a gate. Either rephrase with one of the locked verbs or widen the regex (and update the M32 T5 unit tests in lockstep). The destructive structured intents (`fire`, `close`, `end-meeting`, `promote`) still get the **red** gate independently.

**Task Planner: `delegate_subtask` keeps assigning everything to the same employee.** Workload scoring weights (0.4 role-fit, 0.3 inverse-load, 0.2 availability, 0.1 past-perf) are locked in `agentic-tools-write.ts` and verified in 25 unit tests. In small orgs an employee whose title matches the subtask type AND who is not in a meeting will dominate. Quick fix: archive or set-in-meeting the over-assigned employee so `availability(employee)` returns 0 and the next-highest-scoring employee wins. Long fix: add `capabilities` frontmatter to role.md (deferred to M33/M34) so role-fit becomes more granular than the current title-keyword heuristic.

**Task Planner: subtask escalated and the org chart shows a new ticket on the manager.** Three failed `delegate_subtask` attempts (or three consecutive `review_deliverable` rejects) trigger `task.escalated`. The escalation lifts the subtask one level up the org chart — the manager's `delegate_subtask` queue gets the work next. Filter the Audit tab on `task.escalated` to see the reason payload (`fallback_chain_exhausted` / `repeated_rejects`) and the original subtask. Threshold lives in `planner_escalation_threshold` (default 3, range 1–10) — bump it in Settings → Runtime → Task Planner if escalations fire too aggressively.

**Task Planner: `decompose_project` proposed only 3 subtasks even though I asked for 10.** The `planner_max_tickets` setting is a *cap*, not a target. The LLM proposes whatever count it judges appropriate; the cap only kicks in if it exceeds the limit. Give the prompt more concrete scope ("decompose into 8–10 leaf subtasks", "produce a depth-3 plan with subtasks of subtasks") rather than just bumping the cap. The truncation flag in the envelope (`truncated: true`) tells you when the cap actually fired.

**Task Planner: kanban doesn't update after `delegate_subtask` lands a ticket.** The `task.delegated` event must fire on the bus inside the same transaction boundary that writes the ticket row — that's how `use-ticket-list.ts` invalidates its React Query cache. If the kanban is stale and the Audit tab DOES show the `task.delegated` row, it's a renderer-cache bug (file it). If the Audit tab is missing the row, it's a tool-implementation bug (the write happened but the bus emit didn't — also file it). Workaround: switch tabs and back to force a refetch.

**Task Planner: spec passes locally but CI fails on the amber-gate assertion.** The amber `gateKind: 'write-side'` field is part of the `needs_confirmation` response shape and is checked explicitly in `task-planner.spec.ts`. If a spec edit accidentally swapped to a destructive intent (or the classifier was mis-canned), the palette still renders a confirmation card but with `gateKind: 'destructive'` and the **red** color — the spec's "destructive gate ABSENT" assertion catches this. Trace by checking the canned classifier entry for the test prompt and confirming the intent is `complex_request` not `fire_employee` or similar.

**Unit tests fail with `NODE_MODULE_VERSION` mismatch right after running `electron-rebuild`.** Vitest runs against the system Node ABI; `pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar` compiles `better-sqlite3` for Electron's ABI (currently 125). The two are different — vitest then fails 23+ tests with `NODE_MODULE_VERSION` mismatch. `pnpm rebuild better-sqlite3` silently no-op's because pnpm's content-addressed store already has the hashed (Electron-ABI) artifact and reuses it. The reliable fix is to invoke node-gyp directly inside the package's pnpm cache directory:

```bash
# Rebuild better-sqlite3 for system Node ABI before running vitest
cd node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3 && npm run install
# Then re-run vitest
pnpm test
# Before the next E2E run, rebuild for Electron ABI again
pnpm -F @team-x/desktop exec electron-rebuild -f -w better-sqlite3,keytar
```

The pattern across M31 + M32 + M33 verification gates: **Node rebuild → vitest → Electron rebuild → Playwright**. Repeat as needed when alternating between the two test suites. Same recipe applies to `keytar` if the keychain tests start failing — substitute the keytar path. Verified at M31 T10, M32 T10, and re-verified at M33 T9 + T10.

**Copilot Service: analyzer never produces insights even though `copilot.configure` returned `insightsGenerated: 1` once.** `copilot.configure` is a test-only manual-tick IPC gated on `isTestMode()`. In production, the periodic timer is the only path that produces insights. Confirm `copilot_enabled = true` in **Settings → Runtime → Copilot**, confirm `copilot_categories` is non-empty (empty subset falls back to the full set), and check the Audit tab for `copilot.analyzed { reason: 'periodic' }` rows. If you see `reason: 'malformed_output'`, the LLM is returning drafts that don't match the zod schema — switch to a larger model or bump `agentic_max_tokens` so the model has room to produce well-formed JSON.

**Copilot Service: insights duplicate every 5 minutes.** Dedup is category-scoped + numeric-drift-guarded + Jaccard bigram > 0.8. Two consecutive ticks with byte-identical drafts merge silently (no `copilot.insight` event re-emit on merge). If you see duplicates, the most likely causes are (a) the LLM is classifying semantically-similar drafts under different categories, so they don't merge — tighten `copilot_categories` to remove the noisy category; (b) the titles include shifting numbers ("3 blocked tickets" vs "4 blocked tickets") — that's the numeric-drift guard firing intentionally; (c) the actor truly is generating different titles each tick — file an issue with the prompt summary, the analyzer's prompt-builder might need tuning.

**Copilot Service: `copilot.ask` shows up on the system-agent thread, not system-copilot.** The actor is resolved per call. `copilot.ask` always threads `system-copilot` through as `employeeId`, so its thread surfaces under the **system-copilot** Copilot Conversations row (Sparkles icon, distinct from the Bot icon for system-agent). If you typed your question into the M30 command palette without context, it routed to `complex_request` → `system-agent`; use `copilot.ask` directly (or click into the system-copilot thread first) to route to the Copilot's seat.

**Copilot Service: `copilot.configure` throws "not implemented" or "test-mode only".** By design. `copilot.configure` is the manual-tick test seam (`isTestMode()` gate). Production code paths use `settings.setCopilot` to update cadence; the analyzer picks up the change via `restart(companyId)` automatically. The error message points at the right setting.

**Copilot Service: rolling event window is empty after restart.** `CopilotEventWindow` warm-starts from `events.list({ companyId, limit: 100 })` on first `snapshot` per company. If you see `copilot.analyzed { insightsProposed: 0 }` repeatedly after restart, the warm-start succeeded but the events table is genuinely empty — perform any user action (create a ticket, open a meeting) and the next tick will have signal. The bus subscription is the canonical fallback path: events emitted after the analyzer started land in the deque regardless of warm-start state.

**Copilot Service: spec hangs at the `tool_call(query_copilot_insights)` assertion.** The canned `test-copilot-provider.ts` is the analyzer's seam. The canned `test-agentic-provider.ts` is the `copilot.ask` (agentic-loop) seam. The `copilot-service.spec.ts` E2E uses the `__ECHO_AGENT__:` sentinel path to script the agentic-loop side, so canned-provider entries for `system-copilot` actor are NOT pre-baked into `test-agentic-provider.ts`. If a future copilot E2E adds a non-sentinel prompt, the agentic provider will hit the fallback FIXTURE and the loop may stall — extend the canned tables in lockstep (T8/T9 pattern from M33).

## Things to NOT do

- **Do not use LangChain, LangGraph, CrewAI, AutoGen, or Mastra.** They were considered and rejected; our custom orchestrator is differentiated.
- **Do not add telemetry or phone-home endpoints.** Privacy-first is non-negotiable.
- **Do not add a hosted/cloud-sync feature** without a design-doc amendment.
- **Do not introduce React Server Components or Next.js.** This is Electron; client-only React.
- **Do not use eslint + prettier.** Biome only.
- **Do not hardcode model names** in agent code. Use the registry.
- **Do not create a README.md** until phase 4 unless the user explicitly asks.
- **Do not add emojis** to code or docs unless Rocky asks.

## Inheritance from parent repositories

This project lives under `Strategia-Enhanced-App/` and inherits rules from:

- `~/.claude/CLAUDE.md` — Rocky's global standards (Elite Partner, execution standards, UI/UX bar, security, code quality, blog diligence, SEO/GEO diligence, zero-corner-cutting mandate).
- `Strategia-Enhanced-App/CLAUDE.md` — workspace-level build commands and guidance.

**Zero-tolerance-no-cutting-corners applies here.** Every feature built to full spec, every role.md hand-written to F10 quality, every dashboard state (loading/empty/error/disabled) implemented, every platform tested. Full fidelity. Full effort. Every time.

## Design system reminders

- **Accent color:** `#FFAA2024` (Strategia red)
- **Theme:** dark by default, light mode available
- **Grid:** 8-point (4px fine)
- **Typography:** Inter (UI) + JetBrains Mono (code/streams); 1.2 headings, 1.5–1.6 body, 65–75ch max
- **Icons:** Lucide React
- **Charts:** Recharts
- **Motion:** 150–300 ms feedback, 300–500 ms transitions, ease-out in, ease-in out
- **A11y:** WCAG 2.1 AA minimum, AAA for critical text; keyboard-navigable; 44 px touch targets
- **States:** every interactive element — hover, focus, loading, error, empty, disabled

## Key contacts

- **Project lead:** Rocky Elsalaymeh
- **Primary OS target:** Windows 11 (Phase 1–3); macOS + Linux (Phase 4)
- **Repo visibility:** open-source on commit #1, public GitHub release in Phase 4
