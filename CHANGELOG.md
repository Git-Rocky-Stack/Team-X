# Changelog

All notable changes to Team-X are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### M31 — Agentic Loop (read-side) (2026-04-15)

> **Status:** 9 of 11 tasks shipped (T0–T8). T9 (this docs commit) done. T10 (verification + milestone marker) pending. Baseline: 819 unit tests / 7 E2E → current: 958 unit tests / 8 E2E (+139 unit, +1 E2E). Plan: [`docs/plans/2026-04-14-team-x-phase-5-m31-agentic-loop.md`](docs/plans/2026-04-14-team-x-phase-5-m31-agentic-loop.md).

#### Added
- **System-agent pseudo-employee** — new `is_system` column on `employees` (migration 0010, partial index `idx_employees_system_by_company`), `role-packs/strategia-official/roles/system/system-agent.md` role card, `ensureSystemAgent(companyId)` bootstrap called from `seedIfEmpty`. Exactly one per company; filtered out of `employees.list`, `orgchart.get`, hire dialog, delegation pickers. Backing for every `complex_request` thread
- `@team-x/intelligence/src/loop/` — pure ReAct scheduler: `types.ts` (`LoopStep`, `LoopRun`, `Tool`, `LoopDeps`), `tool-registry.ts` (zod-validated schemas, per-tool timeout, error wrapping), `loop.ts` (`createAgenticLoop` factory, forward-scan brace-balanced JSON parser with one-shot nudge recovery, step/token/wall-clock budget enforcement), `prompt.ts` (canonical ReAct system prompt builder). Zero Electron/DB/fs coupling — all deps injected
- **Six read-only agentic tools** in `apps/desktop/src/main/services/agentic-tools.ts` wrapping existing repos with JSON-safe `{rows, truncated}` projections: `query_employees`, `query_tickets`, `query_projects`, `query_meetings`, `query_vault`, `query_events`. Capped at 50 rows per call with defensive `isSystem = 0` filter on employees and a 200-char payload summarizer with ellipsis
- `AgenticLoopService` (`apps/desktop/src/main/services/agentic-loop-service.ts`) — main-process orchestrator front-door with `start / stop / getRun / waitForRun`. `start()` resolves system-agent, creates a per-query DM thread, instantiates the loop with resolved `providerRouter.complete` + agentic tools, subscribes `onStep` to write step events to the bus and persist transcript rows, emits `agentic.completed` or `agentic.failed`, writes a `runs` row with kind `'agentic'`. `stop(runId)` aborts via per-run `AbortController` with canceled-status coercion across all abort layers
- **Pause-aware `providerRouter.complete` wrapper** polling `orchestrator.isCompanyPaused(companyId)` on every provider call (default 250ms, test 2ms). Loop queues cleanly during meetings and resumes when the orchestrator unpauses — no independent dispatch, honors invariant #2
- `test-agentic-provider.ts` — `NODE_ENV=test` seam mirroring M30 T8's `test-classifier.ts` pattern. Three-tier lookup: `__ECHO_AGENT__:[…]` sentinel → canned per-prompt table → fallback. Per-prompt call-count tracking for multi-step scripted runs
- `test-agentic-tools.ts` — canned `{rows, truncated}` responses keyed by `(toolName, argsHash)`, with `__ECHO_TOOL__:[…]` sentinel and fallback
- **CommandService → AgenticLoopService wiring** — `CommandHandlers.agenticLoopStart(req): Promise<{ runId, threadId }>` (mirrors `employeesFire` / `employeesPromote` shape); stub at `command-service.ts:770-775` replaced with real dispatch; `ExecuteResult` gains `runId` / `threadId` fields for the palette to deep-link into the persisted thread. Composition root `main/index.ts` wires the service + test-mode swaps
- **Copilot Conversations thread UX** — new section in the chat sidenav above regular DMs: Sparkles icon, robot badge, read-only compose box (the agentic loop can't be replied to; it's a transcript, not a conversation). Persisted step transcript renders inline in the chat drawer with step-card variants (`plan` / `tool_call` / `tool_result` / `answer` / `error`). `use-agent-step-stream.ts` hook + `system-agent-badge.tsx` + `thread-list.tsx` + `chat-drawer.tsx` fourth read-only branch
- **Palette step-log mode** — on `complex_request` success the palette transitions from classification view to a streaming step-log panel. Six UI states (idle / streaming / complete / canceled / error / stopped). `data-step-kind` attributes (`plan` / `tool_call` / `tool_result` / `answer` / `error`) as the stable E2E selector surface — assert against these, not against rendered text. Per-step provider + token footer. Cancel button fires `command.stop`, "Open Thread" button deep-links into the persisted Copilot Conversations thread after the run terminates
- `command.stop` IPC channel + handler + preload bridge method. Fires the per-run `AbortController`; next loop step emits `{ kind: 'error', reason: 'canceled' }` and the run terminates with status `canceled`
- **Agentic Loop settings subsection** in Settings → Runtime (below Concurrency). Three clamped numeric inputs: `agentic_max_steps` (1–32, default 8), `agentic_max_tokens` (500–50000, default 8000), `agentic_timeout_ms` (10000–600000, default 120000). Seeded in `settings.seedDefaults()`; persisted via `settings.getAgentic` / `settings.setAgentic` IPC channels
- `agent.step`, `agentic.completed`, `agentic.failed` bus event types + payload interfaces in `packages/shared-types/src/events.ts`. Append-only on the `events` table — consumed by the renderer via the event bus, surfaces in the audit log, drives palette step cards
- **E2E spec `apps/desktop/e2e/agentic-loop.spec.ts`** — full round-trip via classifier/provider/tools seams. Canned classifier returns `complex_request`; canned provider streams plan → `query_employees` tool call → tool result → grounded answer; spec asserts palette step log via `data-step-kind`, persisted thread in Copilot Conversations, `agentic.completed` bus event, audit row. 8/8 E2E green under `pnpm -F @team-x/desktop test:e2e:run`
- New user guide `docs/user-guide/agentic-loop.md` — what the loop is and when it triggers, the 5 step kinds, the 6 read-only tools, step log mode UI, system-agent thread persistence, budget cap settings, stopping a run, troubleshooting, privacy posture

#### Changed
- `CommandService.execute` for `complex_request` intent now dispatches to `AgenticLoopService.start()` and returns `{ runId, threadId }` instead of the M30 T4 stub `{ summary: 'Escalated to agentic loop (M31).' }`
- `telemetry.runs` now includes rows with `kind: 'agentic'` — the Telemetry dashboard's Employees and Cost subviews surface system-agent usage separately (by design — the system-agent is not hidden in telemetry, only in the org chart)
- Architectural invariant #2 re-examined and preserved: the loop's pause-aware wrapper is additive to, not replacing, the orchestrator's scheduling contract. `AgenticLoopService` never creates a slot or dispatches work around the orchestrator — every provider call flows through `providerRouter`, which flows through the orchestrator's slot semaphore
- Phase 5 design doc (`docs/plans/2026-04-13-team-x-phase-5-intelligence-layer.md`) §9 resequenced to reflect as-shipped order: M30 now covers NLU engine + command palette UI (combined, 146 tests), M31 is the agentic loop (originally planned as a bullet inside M31/Command Palette UI, now its own milestone), M34 deps pointer shifted from M31 → M30. §10 gains `command.stop` + `settings.getAgentic/setAgentic` + agentic bus events; §11 gains three `agentic_*` settings keys; §13 gains decisions D8 (read-side only in M31), D9 (system-agent seat), D10 (built-in main-process tools, not MCP); new §14 Follow-ups documents F1 (step-stream backfill) and F2 (thread-list bus invalidator)
- CLAUDE.md Status line, Phase 5 block, Phase plan list, IPC table, bus events table, and Troubleshooting section all updated for M31 as-shipped

#### Fixed
- `complex_request` from M30 T4 now actually does something. The stub `{ summary: 'Escalated to agentic loop (M31).' }` response that made the 15th intent a no-op is gone — a typed `complex_request` now produces a grounded multi-paragraph answer in a persisted thread

---

### M30 — NLU Engine + Command Palette (2026-04-13)

#### Added
- Natural-language command palette (`Cmd+K` / `Ctrl+K`) exposing 15 intents through an LLM-backed classifier with a destructive-action confirmation gate
- `@team-x/intelligence/nlu` — `intent-classifier` (LLM JSON output with one-shot retry + `complex_request` fallback), `entity-resolver` (fuzzy name match + FTS5 for tickets/vault, candidate disambiguation), `slot-filler` (per-intent required-slot table, destructive-intent confirmation summary)
- 60-example labeled intent fixture (`packages/intelligence/src/nlu/fixtures/intent-examples.test.ts`) with deterministic mock-LLM driver achieving ≥90% classification accuracy
- Test-mode classifier seam (`createTestModeClassifier`) — canned input → intent table for E2E spec without LLM round-trips
- `CommandService` (`apps/desktop/src/main/services/command-service.ts`) — owns the intent → IPC handler dispatch table for all 15 intents, enforces destructive `confirmed: true` invariant, emits `command.executed` events on success
- `command.parse`, `command.execute`, `command.history`, `command.suggest` IPC channels with typed `TeamXApi` bindings and preload bridge methods
- Command palette UI — Radix `Dialog` (560px wide), debounced 200ms classification, intent + entity chips, color-coded confidence bar, candidate disambiguation rows, destructive-confirm step, undo toast on non-destructive success, `ArrowUp` history picker from empty input, `/show <view>` slash-command bypass
- Command history persisted to `settings.command.history` (FIFO, last 20) plus a "Recent Commands" section on the Dashboard subview
- `command_history` storage table semantics via the existing settings key-value store; `command.executed` event type added to `packages/shared-types/src/events.ts`
- New user guide `docs/user-guide/command-palette.md` covering all 15 intents with examples, destructive-action gate, history, slash commands, troubleshooting, and privacy posture
- E2E spec `apps/desktop/e2e/command-palette.spec.ts` exercising parse → confirm → execute → history with the canned classifier and a real `employees.fire` round-trip

#### Changed
- Audit log (`AuditView`) now renders `command.executed` events with human-readable intent + entities summary labels alongside existing event types
- Top-bar architectural badge tracks Phase 5 progress; `CLAUDE.md` baseline test count updated 673 → 819 unit tests, E2E spec count 5 → 7
- New architectural invariant #11 — *"IPC channels that mutate state must emit a bus event"* — added to `CLAUDE.md` to prevent the React Query staleness class of bug surfaced by `vault-backup.spec.ts`

#### Fixed
- `vault.file_created` / `vault.file_deleted` events now emit on DB commit from the vault service (M30 T0) — closes the renderer-cache staleness regression that broke `vault-backup.spec.ts` and lays groundwork for M32 RAG-on-vault. See `docs/plans/2026-04-13-vault-backup-regression-findings.md` §7 for the full root-cause analysis

---

## [1.0.0] — 2026-04-13

### M27 — Final Hardening + v1.0.0 (2026-04-13)

#### Added
- Playwright E2E `vault-backup.spec.ts` — vault upload, SHA256 integrity verification, backup create, backup list verification
- Ed25519 role-pack signature verification (`pack-signature.ts`) — keypair generation, archive signing, signature verification with 10 unit tests
- Security audit report (`docs/audits/2026-04-13-m27-security-audit.md`) — dependency audit, IPC input validation sweep, context isolation check, secrets handling review (all PASS)
- Phase 4 badge in top bar (replacing Phase 3)
- Version bump from 0.0.1 to 1.0.0 across all 6 packages
- 612 unit tests + 4 E2E specs passing

### M26 — Documentation + Landing Site (2026-04-13)

#### Added
- `README.md` — hero section, feature grid, architecture overview, tech stack table, quickstart, testing guide, privacy section
- `CONTRIBUTING.md` — development setup, coding standards, PR guidelines, role-pack contribution guide, IPC channel conventions
- `CHANGELOG.md` — all 27 milestones documented in Keep a Changelog format
- 7 user guide docs (`docs/user-guide/`) — getting started, hiring employees, managing projects, using the vault, configuring providers, backup and restore, keyboard shortcuts
- Static landing site (`docs/site/index.html`) — Tailwind CDN, dark theme, responsive layout, 9-feature grid, architecture diagram, tech stack badges, 3-step quickstart

---

## Phase 4 — Ship-Readiness

### M25 — Cross-Platform Installers (2026-04-13)

#### Added
- electron-builder configuration for Windows (NSIS), macOS (DMG), and Linux (AppImage + .deb)
- Placeholder app icons with `scripts/generate-icons.mjs` (256px + 512px PNG)
- macOS entitlements plist for keychain access
- `pnpm dist`, `dist:win`, `dist:mac`, `dist:linux`, `dist:publish` scripts
- `UpdaterService` — user-triggered update checks from GitHub Releases (zero phone-home)
- `updater.check` and `updater.install` IPC channels
- `UpdaterSection` in Settings with version info, release notes, download progress, and install button
- GitHub Actions release workflow (`release.yml`) — matrix build on `v*` tags with SHA256 checksums and draft releases
- 12 new tests (7 updater service + 5 handler tests)

### M24 — Audit Log UI (2026-04-13)

#### Added
- `AuditRepo` — read-only queries on the append-only events table with filters and aggregation
- `audit.list`, `audit.stats`, `audit.export` IPC channels
- `AuditView` — summary cards, event type filter chips, actor search, date range picker, expandable rows with payload JSON viewer, pagination
- CSV and JSON export of filtered audit events
- Audit tab enabled in the top bar navigation
- 16 new tests

### M23 — Backup/Restore (2026-04-13)

#### Added
- `BackupService` — WAL checkpoint + SQLite + vault directory archive with manifest.json
- Restore with manifest validation, orchestrator stop/restart, and data verification
- `backup.create`, `backup.restore`, `backup.list` IPC channels
- `BackupSection` in Settings with create, restore, and history UI
- 5 new tests

### M22 — Ticket Attachments (2026-04-13)

#### Added
- `ticket_attachments` linking table (migration `0007_ticket_attachments.sql`)
- `TicketAttachmentsRepo` with attach, detach, and list operations
- `tickets.attachFile`, `tickets.detachFile`, `tickets.listAttachments` IPC channels
- Attachment section in ticket detail panel with vault file picker
- 8 new tests

### M21 — File Vault (2026-04-13)

#### Added
- `file_vault` table with FTS5 full-text search (migration `0006_file_vault.sql`)
- Best-effort FTS5 initialization via `fts5-init.ts` (LIKE fallback for sql-js tests)
- `VaultRepo` and `VaultService` — SHA256 integrity, text extraction for markdown/txt/code
- `vault.upload`, `vault.download`, `vault.list`, `vault.search`, `vault.delete`, `vault.verify`, `vault.stats` IPC channels
- `VaultView` with file browser, search bar, detail panel, and Files tab
- 31 new tests

---

## Phase 3 — The Live Cockpit

### M20 — Demo + Hardening (2026-04-12)

#### Added
- Playwright E2E `meeting-flow.spec.ts` — call meeting, interject, end, verify minutes
- Updated smoke + ticket-flow E2E specs for Phase 3 badge
- 590 unit tests + 3 E2E specs passing

### M19 — Runtime Modes + Privacy (2026-04-12)

#### Added
- `SettingsRepo` — key-value store with `seedDefaults` for runtime configuration
- Hardware profiler — CPU, RAM, GPU detection (session-cached)
- Strategy picker — Auto/Hybrid/Always-On/Lean based on hardware and available providers
- Privacy tier types and constants (`PRIVACY_TIER_RANK`, `DEFAULT_CONCURRENCY_CAPS`, `STRATEGY_SLOTS`)
- `settings.getRuntime`, `settings.setRuntime`, `settings.getPrivacy`, `settings.setPrivacy`, `settings.getConcurrency`, `settings.setConcurrency` IPC channels
- `RuntimeSection`, `PrivacySection`, `ConcurrencySection` in Settings UI
- 530 unit tests passing

### M18 — Additional Providers (2026-04-12)

#### Added
- 7 new provider adapters: OpenAI, Google, Groq, OpenRouter, Together, Fireworks, OpenAI-compatible
- Provider factory extended with per-adapter `buildStream` and default models
- `ProvidersService` with add/update/remove and 6 disabled seed rows
- Environment key bootstrap for 7 new API keys
- `providers.list`, `providers.add`, `providers.update`, `providers.remove`, `providers.testConnection` IPC channels
- `ProvidersSection`, `ProviderCard`, `AddProviderDialog` in Settings UI
- 501 unit tests passing

### M17 — Telemetry Dashboard (2026-04-12)

#### Added
- 4 aggregate query methods on runs repo (companyStats, dailyUsage, employeeStats, costBreakdown)
- `telemetry.companyStats`, `telemetry.dailyUsage`, `telemetry.employeeStats`, `telemetry.costBreakdown` IPC channels
- Recharts integration for data visualization
- `TelemetryView` with Company, Employees, and Cost subviews
- Telemetry tab enabled
- 456 unit tests passing

### M16 — Meeting Primitive (2026-04-12)

#### Added
- `meetings` table and `companies.status` column (migration `0005_meetings.sql`)
- `MeetingsRepo` with CRUD and lifecycle management
- Per-company orchestrator pause/drain (`pauseCompany`/`resumeCompany`/`isCompanyPaused`)
- `MeetingService` — call, next turn, interject, end with minutes generation and action item extraction
- `meetings.call`, `meetings.end`, `meetings.interject`, `meetings.list`, `meetings.get` IPC channels
- `MeetingsView` with list panel, detail panel, call dialog, and composer
- Meetings tab enabled
- 441 unit tests passing

### M15 — Goals + Projects (2026-04-12)

#### Added
- `goals`, `projects`, `project_tickets` tables (migration `0004_goals_projects.sql`)
- `GoalsRepo` and `ProjectsRepo` with CRUD and progress calculation
- 12 new IPC channels (5 goals.*, 7 projects.*)
- Projects kanban board with 4-column drag-drop, project cards, detail panel, and create dialog
- Goals subtab with progress bars, goal rows, detail panel, and create dialog
- Projects tab enabled
- 412 unit tests passing

### M14 — Dashboard Subviews (2026-04-12)

#### Added
- 4 dashboard subviews: Timeline, Stream, Floor, Org embed
- Subtab navigation in Dashboard
- Top bar expanded to all 8 tabs
- `events.list` IPC channel with cursor-based pagination
- 384 unit tests passing

---

## Phase 2 — The Org

### M13 — Demo + Hardening (2026-04-11)

#### Added
- Playwright E2E `ticket-flow.spec.ts` — create, assign, agent reply round-trip
- Production build fix (`inlineDynamicImports` for ESM collision)
- 379 unit tests + 2 E2E specs passing

### M12 — Tickets + Kanban (2026-04-11)

#### Added
- `tickets` table (migration `0003_tickets.sql`) with 8 IPC channels
- 4-column kanban board (Open, In Progress, Blocked, Done) with drag-to-move
- Ticket detail panel with discussion thread
- `CreateTicketDialog` with priority and assignee selection
- Assigning a ticket triggers an orchestrator agent run

### M11 — Employee-to-Employee Messaging (2026-04-11)

#### Added
- Built-in tools: `send_message_to_colleague`, `list_colleagues`
- Orchestrator `enqueueAgentReply` with role-relative history mapping
- `is_agent_initiated` column for distinguishing bot-initiated threads
- `ThreadList` UI with amber bot icons and read-only agent thread viewing

### M10 — MCP Host + Tool Calling (2026-04-11)

#### Added
- `McpHost` singleton with stdio/SSE connection pool
- `tools_allowed`/`tools_denied` enforcement at host level
- `mcp_servers` and `tool_calls` tables
- Streaming tool-call support via `fullStream`
- 5 `mcp.*` IPC channels
- Default MCP seeds (Context7, Supabase)

### M9 — Org Chart + Hire/Fire/Promote (2026-04-11)

#### Added
- `org_edges` table with cycle detection
- `employees.fire`, `employees.promote`, `employees.setManager`, `orgchart.get` IPC channels
- Indented-list org tree UI with color-coded levels
- Drag-to-rearrange and "Reports to" manager selection in hire flow

### M8 — Role Pack System + 55 Roles (2026-04-11)

#### Added
- Role-loader with `listRoles()`, `listByLevel()`, `reload()`
- 55 F10-quality roles across 6 levels: Officer (5), Senior Management (7), Management (8), Supervisor (5), Lead (5), IC (25)
- Searchable hire dialog with level filter chips

### M7 — Multi-Company + Workspace (2026-04-11)

#### Added
- Company CRUD with soft-delete (archived_at)
- `WorkspaceSwitcher` and `CreateCompanyDialog`
- `CompanySettings` panel
- `mcp_configs_json`, `provider_prefs_json`, `max_concurrent_agents` columns on companies table

---

## Phase 1 — Skeleton

### M6 — Demo + Hardening (2026-04-07)

#### Added
- Playwright E2E `smoke.spec.ts` — full chat round-trip with test-mode provider
- CI e2e job (Ubuntu + xvfb)
- DevTools + will-quit shutdown fixes

### M5 — Renderer (2026-04-07)

#### Added
- Tailwind CSS + shadcn/ui dark theme
- Zustand + React Query state management
- IPC client hooks
- App shell: top bar, sidenav, content area
- Dashboard cards view with live token stream preview
- Chat drawer with streaming replies and composer
- Hire dialog, empty/loading/error states
- Inter + JetBrains Mono typography
- WCAG 2.1 AA accessibility pass

### M4 — Agent Runtime (2026-04-07)

#### Added
- Append-only event bus
- Slot-semaphore work queue
- `runAgent` with live streaming and persistence
- Orchestrator facade
- Anthropic + Ollama adapters via Vercel AI SDK
- `provider-factory` with keytar + privacy-tier fallback
- `role-loader` with directory scan and template rendering
- `employees.list`, `chat.send`, `chat.list` IPC channels
- Typed preload bridge (`window.teamx: TeamXApi`)
- Test-mode provider for Playwright E2E
- `smoke-chat.ts` script for manual Ollama verification

### M3 — Main Process + Database (2026-04-07)

#### Added
- Electron boot with context isolation
- SQLite + Drizzle ORM with migration-on-first-run
- Seed: Strategia-X company with CEO + Senior Fullstack Engineer
- `SecretsStore` backed by keytar
- `ProvidersService` seeding `ollama-local` + `anthropic`
- Dev `.env` to keychain bootstrap

### M2 — Shared Packages (2026-04-07)

#### Added
- `shared-types` — IPC contract types
- `role-schema` — role.md parser + template renderer
- `provider-router` — registry + streaming adapters (Anthropic + Ollama)
- `telemetry-core` — cost math

### M1 — Repository Foundations (2026-04-07)

#### Added
- pnpm workspace with monorepo structure
- TypeScript strict mode across all packages
- Biome for linting and formatting
- Vitest for unit testing
- GitHub Actions CI workflow
