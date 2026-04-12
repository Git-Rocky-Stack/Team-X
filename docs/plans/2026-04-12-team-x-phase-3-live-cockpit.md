# Phase 3 (The Live Cockpit) — Design & Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the bare dashboard into a real-time command center with 5 dashboard subviews, meetings, goals/projects, telemetry analytics, 7 additional LLM providers, adaptive runtime modes, and privacy tier filtering.

**Architecture:** Extend the existing Electron + React + SQLite stack. New DB tables for goals, projects, and meetings. New provider adapters via Vercel AI SDK. Orchestrator gains meeting pause/drain, runtime strategy selection, and privacy-tier enforcement. Renderer expands from 2 views (Dashboard + Tickets) to 9 top-level tabs with subview routing.

**Tech Stack:** Same locked stack (Electron, React 19, Tailwind, shadcn/ui, Zustand, React Query, Drizzle ORM, Vitest, Playwright). New: Recharts for telemetry charts, 7 AI SDK provider packages.

**Demo:** *"One-click all-hands -> minutes -> action items -> tickets."*

---

## Scope decisions (locked with Rocky 2026-04-12)

1. **Dashboard subviews:** Cards (enhance existing), Timeline (activity feed from events), Stream (multiplex live output), Floor (simplified grid status map). Org chart becomes its own top-level tab per design doc.
2. **Meetings:** Round-robin mode first. Chair-directed + freeform in hardening. Rocky can interject. Minutes + action items -> tickets.
3. **Goals & Projects:** Goals -> Projects -> Tickets hierarchy. Project kanban. Goal tracking with progress percentage.
4. **Telemetry:** Recharts. Company-level (daily tokens/cost), employee-level (per-agent), cost breakdown (by provider/model). Data from existing `runs` table.
5. **Providers:** OpenAI, Google (Gemini), Groq, OpenRouter, Together, Fireworks, OpenAI-compatible. All via Vercel AI SDK provider packages.
6. **Runtime modes:** Auto-profile on startup. Hybrid/Always-On/Lean strategies. Settings UI toggle. Per-provider concurrency caps enforced in orchestrator.
7. **Privacy tier:** Filter in provider router. User sets max tier in settings. Provider resolution falls back when tier blocked.
8. **Vector store / memories / embeddings (sqlite-vec):** DEFERRED to Phase 4. Not needed for the Phase 3 demo.

## Scope guardrails (Phase 4+)

- File vault + blob storage
- Backup/restore + audit log UI
- Community role packs + signature verification
- Installers + landing site
- Worker threads (benchmark only in Phase 3)

---

## Milestones overview

| # | Milestone | Deliverable |
|---|-----------|-------------|
| M14 | Dashboard subviews | 4 new subviews (Timeline, Stream, Floor, Org embed) + subtab nav in Dashboard |
| M15 | Goals & Projects | `goals` + `projects` tables, CRUD, hierarchy, project kanban |
| M16 | Meeting primitive | Orchestrator pause/drain, meeting thread + turns, minutes, action items -> tickets |
| M17 | Telemetry dashboard | Company/employee/cost analytics with Recharts, data from `runs` table |
| M18 | Additional providers | 7 new adapters (OpenAI, Google, Groq, OpenRouter, Together, Fireworks, OAI-compat) + provider settings UI |
| M19 | Runtime modes + privacy | Auto-profiling, Hybrid/Always-On/Lean, privacy tier filter, settings UI |
| M20 | Demo + hardening | Full demo walkthrough, E2E meeting-flow, CLAUDE.md update, `phase-3` tag |

Review checkpoints after every milestone. Do not blast through checkpoints.

---

## Milestone 14 — Dashboard subviews

### What exists (Phase 2)
- Cards view: live token stream preview per employee, status dots, click-to-chat.
- Top bar with tabs: Dashboard, Projects (disabled), Tickets, Meetings (disabled), Telemetry (disabled).
- `ActiveView` type: `'dashboard' | 'tickets'`.

### What M14 delivers

1. **Dashboard subtab navigation:** The Dashboard tab gains an inner subtab bar: Cards | Timeline | Stream | Floor. Default = Cards. `ActiveView` expands to include all top-level tabs from the design doc.

2. **Timeline subview:** Chronological activity feed built from the `events` table. Shows: work started/completed, tool calls, agent messages, ticket status changes. Each entry has: timestamp, actor avatar + name, event description, link to relevant thread/ticket. Infinite scroll via cursor pagination.

3. **Stream subview:** Multiplexed live output from all active agents. Split-pane layout — one column per thinking agent, up to 4 visible (horizontal scroll for more). Each pane shows the employee name, status, and live token stream. Clicking a pane opens the full chat drawer.

4. **Floor subview:** Simplified grid view of all employees. Each cell = avatar + name + status indicator (idle/thinking/meeting). Color-coded by level. Compact — designed for 50+ employees at a glance.

5. **Top-bar expansion:** Enable all tabs from the design doc: Dashboard, Org, Projects, Tickets, Meetings, Chat, Telemetry, Settings. Disabled tabs render as placeholders until their milestone ships. `ActiveView` type expands accordingly.

### DB changes
- None. Timeline reads from existing `events` table.

### New IPC channels
- `events.list` -> paginated events for the timeline view (cursor-based).

### Tests
- Timeline: event list pagination, date grouping, event type rendering.
- Stream: multiplex layout with 0/1/4 active agents.
- Floor: grid rendering with 2/20/55 employees.
- Subtab navigation: switch between Cards/Timeline/Stream/Floor.

---

## Milestone 15 — Goals & Projects

### What M15 delivers

1. **DB tables:**
   - `goals`: id, companyId, title, description, status (active/achieved/abandoned), progressPct (0-100), targetDate, createdAt, updatedAt.
   - `projects`: id, companyId, goalId (FK nullable), title, description, status (planning/active/completed/archived), leadId (FK to employees), priority, createdAt, updatedAt.
   - `project_tickets`: junction table linking projects to tickets (M:N).

2. **Goal CRUD + IPC:** `goals.create`, `goals.update`, `goals.list`, `goals.get`, `goals.delete`.

3. **Project CRUD + IPC:** `projects.create`, `projects.update`, `projects.list`, `projects.get`, `projects.delete`, `projects.linkTicket`, `projects.unlinkTicket`.

4. **Projects tab UI:** Kanban board (planning/active/completed/archived columns). Project cards show: title, lead, ticket count, progress bar. Click card -> detail panel with linked tickets + goal info.

5. **Goal tracking:** Goals list view with progress bars. Progress = weighted average of linked project completion. Goal detail shows linked projects.

6. **Project -> Ticket decomposition:** "Add Tickets" button in project detail that creates tickets pre-linked to the project.

### DB changes
- Migration: `goals` table, `projects` table, `project_tickets` junction.

### New IPC channels
- 5 `goals.*` channels, 7 `projects.*` channels.

### Tests
- Goals: CRUD, progress calculation, cascade behavior.
- Projects: CRUD, ticket linking/unlinking, kanban state transitions.
- Integration: goal -> project -> ticket hierarchy.

---

## Milestone 16 — Meeting primitive

### What M16 delivers

This is the centerpiece of Phase 3 and the most architecturally significant milestone.

1. **Orchestrator pause/drain:**
   - `orchestrator.pause(companyId)` — sets company status to 'meeting', stops dispatching new WorkItems for that company, waits for in-flight items to drain (finish current token, persist, release slot).
   - `orchestrator.resume(companyId)` — sets company status to 'running', re-enables work dispatch, processes queued items.
   - Enforces the architectural invariant: orchestrator is the ONLY scheduler.

2. **Meeting lifecycle:**
   - `callMeeting({ companyId, attendees, agenda, chair, mode })` — creates meeting thread (kind='meeting'), pauses orchestrator, dispatches turns.
   - `endMeeting(meetingId)` — triggers summarizer -> minutes -> action items -> tickets, resumes orchestrator.
   - DB: `meetings` table (id, companyId, threadId, chair, agenda, mode, status, minutesMd, createdAt, endedAt).

3. **Turn management (round-robin):**
   - Chair speaks first (frames the agenda).
   - Each attendee speaks in order, one turn per round.
   - Rocky can interject at any time via the meeting composer.
   - Turn state tracked in orchestrator memory (not DB — ephemeral).

4. **Minutes + action items:**
   - On `endMeeting`, the chair (or a designated summarizer) generates:
     - `minutesMd` — markdown summary of the meeting.
     - Action items extracted as structured data -> auto-created as tickets.

5. **Meeting UI:**
   - Sidenav "Call Meeting" button (always visible).
   - Meeting modal: pick attendees (checkboxes), set agenda (textarea), pick chair (dropdown), start.
   - Meeting thread view: live turn-by-turn display, Rocky's composer at bottom.
   - "End Meeting" button triggers summarization.
   - Meetings tab: list past meetings with minutes + action items.

6. **Company status column:** Add `status` column to companies table ('running' | 'meeting' | 'paused').

### DB changes
- Migration: `meetings` table, `status` column on `companies`.

### New IPC channels
- `meetings.call` — start a meeting.
- `meetings.end` — end meeting, trigger summarization.
- `meetings.interject` — Rocky sends a message mid-meeting.
- `meetings.list` — list past meetings for company.
- `meetings.get` — get meeting detail with thread + minutes.

### Architecture invariant reminder
The meeting primitive is CLEAN because the orchestrator is the only scheduler. When it says pause, nothing new dispatches. No race conditions with in-flight tool calls.

### Tests
- Orchestrator: pause drains in-flight, resume re-enables dispatch, pause during pause is no-op.
- Meeting: lifecycle (call -> turns -> interject -> end), minutes generation, action item extraction.
- Integration: action items create real tickets linked to meeting.
- E2E: full meeting flow in M20.

---

## Milestone 17 — Telemetry dashboard

### What M17 delivers

1. **Telemetry tab UI:** Three subviews — Company, Employee, Cost.

2. **Company telemetry:**
   - Daily token usage chart (Recharts AreaChart, 30-day window).
   - Daily cost chart (Recharts AreaChart, 30-day window).
   - Total runs, total tokens, total cost (summary cards).
   - Active employees count, average response time.

3. **Employee telemetry:**
   - Per-employee table: name, role, total runs, total tokens, avg latency, total cost.
   - Click row -> employee detail chart (7-day activity).
   - Sortable by any column.

4. **Cost breakdown:**
   - By provider (Recharts PieChart).
   - By model (Recharts BarChart).
   - Date range filter (7d / 30d / 90d / all).

5. **Data source:** All data from existing `runs` table. New aggregate queries in runs repo. `telemetry-core` package gains `aggregateByDay`, `aggregateByProvider`, `aggregateByEmployee` functions.

### DB changes
- None. Reads from existing `runs` table.

### New IPC channels
- `telemetry.companyStats` — aggregated company-level stats.
- `telemetry.employeeStats` — per-employee breakdown.
- `telemetry.costBreakdown` — by provider/model with date range.
- `telemetry.dailyUsage` — daily time-series data.

### Tests
- Aggregation queries: by day, by provider, by employee, with date filters.
- Empty state: no runs -> zero-value charts.
- Cost calculation accuracy: verify against telemetry-core pricing.

---

## Milestone 18 — Additional providers

### What M18 delivers

1. **7 new provider adapters** in `packages/provider-router/src/adapters/`:
   - `openai.ts` — OpenAI (GPT-4o, o1, etc.) via `@ai-sdk/openai`.
   - `google.ts` — Google Gemini via `@ai-sdk/google`.
   - `groq.ts` — Groq (Llama, Mixtral) via `@ai-sdk/groq`.
   - `openrouter.ts` — OpenRouter aggregator via `@ai-sdk/openrouter`.
   - `together.ts` — Together AI via `@ai-sdk/togetherai`.
   - `fireworks.ts` — Fireworks AI via `@ai-sdk/fireworks`.
   - `openai-compat.ts` — Generic OpenAI-compatible endpoints via `@ai-sdk/openai` with custom baseURL.

2. **Provider factory extension:** `provider-factory.ts` `buildStream` function routes by `provider.kind` to the correct adapter. New kinds: `openai`, `google`, `groq`, `openrouter`, `together`, `fireworks`, `openai-compatible`.

3. **Provider management settings UI:**
   - Settings tab -> Providers section.
   - List all configured providers with status (connected/disconnected/no key).
   - Add provider: pick kind, enter API key (saved to keytar), configure base URL if applicable.
   - Test connection button.
   - Enable/disable toggle per provider.

4. **Model registry seed:** Default models per provider seeded into `settings` table as a JSON manifest.

5. **Env-key bootstrap extension:** `bootstrapEnvKeys` extended to import all provider API keys from `.env` on first dev boot.

### DB changes
- None. Uses existing `providers` table. New rows seeded per provider kind.

### New IPC channels
- `providers.list` — list all providers with status.
- `providers.add` — register new provider.
- `providers.update` — update config/enabled.
- `providers.remove` — remove provider.
- `providers.testConnection` — verify API key + connectivity.

### Tests
- Each adapter: stream creation with mock, error handling.
- Provider factory: routing by kind, fallback on missing key.
- Integration: full round-trip with test-mode for each provider kind.

---

## Milestone 19 — Runtime modes + privacy tier

### What M19 delivers

1. **Hardware profiler:** `apps/desktop/src/main/services/profiler.ts`
   - Detects: CPU cores, total RAM, GPU presence + VRAM, battery saver mode.
   - Runs once at startup, cached for session.

2. **Strategy selection:** `pickStrategy()` function in orchestrator.
   - Auto: profiles hardware + configured providers -> picks Hybrid/Always-On/Lean.
   - Manual override via settings (user always wins).
   - Strategies affect: concurrent slot count, model loading behavior, dispatch priority.

3. **Per-provider concurrency caps:**
   - Configurable in settings UI.
   - Defaults from design doc (ollama=1, anthropic=4, openai=6, etc.).
   - Orchestrator work queue respects caps per provider.

4. **Privacy tier filter:**
   - User sets `max_privacy_tier` in settings: `local` | `open-source-cloud` | `proprietary-cloud`.
   - Provider router checks tier before resolving. If blocked, falls back to next candidate per `fallback_providers`.
   - Visual indicator in UI showing which tier is active.

5. **Settings tab UI:**
   - Runtime section: current strategy (auto-detected or manual), hardware profile summary, slot counts.
   - Privacy section: tier selector, visual indicator of which providers are available at each tier.
   - Provider section: per-provider concurrency cap sliders.

### DB changes
- Migration: `runtime_strategy` and `max_privacy_tier` settings rows.

### New IPC channels
- `settings.getRuntime` — current strategy + hardware profile.
- `settings.setRuntime` — manual strategy override.
- `settings.getPrivacy` — current privacy tier.
- `settings.setPrivacy` — update privacy tier.
- `settings.getConcurrency` — per-provider caps.
- `settings.setConcurrency` — update caps.

### Tests
- Profiler: mock hardware detection, verify strategy selection.
- Privacy filter: block proprietary when set to local, fallback chain.
- Concurrency: cap enforcement with multiple concurrent requests.

---

## Milestone 20 — Demo + hardening

### What M20 delivers

1. **Full demo walkthrough:** Verify the Phase 3 demo end-to-end:
   - Start with a company (Strategia-X) with 5+ employees.
   - View Dashboard -> switch between Cards/Timeline/Stream/Floor.
   - Create a goal + project, link tickets.
   - Call an all-hands meeting with 3+ attendees.
   - Watch the meeting unfold turn-by-turn.
   - Rocky interjects with a question.
   - End meeting -> view auto-generated minutes.
   - Verify action items became tickets in the kanban.
   - View telemetry: token usage, cost breakdown, per-employee stats.
   - Switch runtime mode in settings.

2. **Playwright E2E:** Meeting-flow spec — call meeting, verify turns, end meeting, verify minutes + action item tickets.

3. **CLAUDE.md update:** Phase 3 status, all new IPC channels, meeting configuration docs, telemetry queries, runtime mode troubleshooting.

4. **`phase-3` tag** after sign-off.

### Testing strategy

- **Unit tests (Vitest):** Every new repo, service, adapter, aggregation query. Target: ~550+ tests.
- **Integration tests:** Meeting lifecycle (pause/drain/resume), goal->project->ticket hierarchy, privacy tier fallback chain.
- **E2E tests (Playwright):** Phase 1 smoke (maintained), Phase 2 ticket-flow (maintained), Phase 3 meeting-flow (new).

### Risk log

| Risk | Mitigation |
|------|-----------|
| Meeting turn ordering with slow providers | Hard timeout per turn (30s default), skip on timeout, log warning |
| Minutes quality depends on model capability | Use highest-tier available model for summarization; test-mode provides canned minutes |
| 7 new provider adapters = 7 API key configs | Only Anthropic + Ollama required; others are opt-in. Clear "not configured" state in UI |
| Recharts bundle size | Tree-shake to only imported chart types; verify bundle stays under 1.5 MB |
| Hardware profiler cross-platform | Windows (Phase 3 target) only; macOS/Linux stubs return conservative defaults |
| Privacy tier blocks all configured providers | Graceful error: "No provider available at your privacy setting. Consider relaxing the tier." |

---

*End of Phase 3 design. Next: detailed task-by-task implementation (invoke executing-plans skill per milestone).*
