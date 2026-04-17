# Phase 5 — Intelligence Layer

**Author:** Rocky Elsalaymeh + Claude  
**Date:** 2026-04-13  
**Status:** Approved  
**Version:** 1.0  

---

## 1. Overview

Phase 5 adds four AI-powered capabilities to Team-X:

1. **Natural Language Command Bar** — a global `Cmd+K` palette that accepts NL input ("assign the auth bug to Sarah") and dispatches to existing IPC channels, plus a persistent AI assistant agent for complex multi-step conversations.
2. **Smarter Agent Context (RAG)** — full RAG pipeline over vault files, thread messages, ticket content, meeting minutes, goals, and projects. Agents receive semantically relevant institutional knowledge at every turn.
3. **Agent Collaboration Intelligence** — manager and lead agents can autonomously decompose projects into tickets, delegate to ICs based on skills/workload, and review deliverables. Guardrails (budget caps, approval gates, depth limits) enforced at the orchestrator level.
4. **In-App AI Copilot** — an omnipresent sidebar that surfaces operational insights, cost anomalies, org optimization recommendations, and workflow suggestions across all tabs.

**Tagline:** *"Your AI company now thinks for itself."*

---

## 2. Architectural Approach

**Approach A: Intelligence Layer** (selected over "Extend Orchestrator" and "MCP-Native Intelligence").

A new `packages/intelligence` workspace package sits between the orchestrator and existing systems. It:

- Respects all 10 architectural invariants (orchestrator stays a scheduler, event bus stays append-only, provider router stays the only LLM touch-point, zero phone-home).
- Shares NLU + RAG infrastructure across all four features.
- Is testable in isolation — no Electron dependency in the package.
- Extends existing systems via injection (callbacks, event subscriptions, built-in tools) without mutating them.

---

## 3. Package Structure

```
packages/intelligence/
  src/
    nlu/
      intent-classifier.ts     # LLM-based intent classification
      entity-resolver.ts       # Fuzzy name match + FTS5 entity resolution
      slot-filler.ts           # Missing parameter detection + prompting
      intents.ts               # Intent schema definitions
      index.ts
    rag/
      embeddings.ts            # Embedding generation via provider-router
      chunker.ts               # Content chunking (512 tokens, 64 overlap)
      retriever.ts             # sqlite-vec ANN search + relevance filter
      indexer.ts               # Event bus subscriber for on-write indexing
      index.ts
    planner/
      decomposer.ts            # Project → ticket tree decomposition
      delegator.ts             # Workload-aware assignment scoring
      reviewer.ts              # Deliverable review orchestration
      guardrails.ts            # Depth limits, budget caps, approval gates
      built-in-tools.ts        # decompose_project, delegate_subtask, review_deliverable
      index.ts
    copilot/
      analyzer.ts              # Periodic insight generation
      categories.ts            # Insight category definitions + prompts
      deduplicator.ts          # Title-similarity deduplication
      copilot-service.ts       # Lifecycle: subscribe, analyze, surface
      index.ts
    index.ts                   # Public API
  vitest.config.ts
  tsconfig.json
  package.json                 # @team-x/intelligence
```

---

## 4. Data Flow

```
User input (palette / chat)
  |
  v
+---------------------+
|   NLU Engine         |  <-- packages/intelligence
|  (intent + entities) |
+--------+------------+
         |
    +----+----+
    |         |
    v         v
 Command   Complex
 (direct)  (conversational)
    |         |
    v         v
  IPC      Copilot Agent
 Handler    (system employee)
    |         |
    v         v
 Orchestrator <--+
    |
    v
+---------------------+
|   RAG Pipeline       |  <-- packages/intelligence
|  (context injection) |
+--------+------------+
         |
         v
   resolveSystemPrompt
   (existing callback,
    now RAG-enhanced)
         |
         v
   Provider Router --> LLM
         |
         v
   Event Bus --> Dashboard
         |
         v
   RAG Indexer (on-write)
   embeds new content
```

**Integration points:**

1. **NLU** hooks into new `command.*` IPC channels (palette) and a special "System AI" employee (chat agent).
2. **RAG** hooks into the existing `resolveSystemPrompt` callback. Embeddings generated on write via event bus subscriptions.
3. **Planner** exposes new built-in tools injected alongside `send_message_to_colleague` and `list_colleagues`.
4. **Copilot** subscribes to the event bus, runs periodic analysis, surfaces via `copilot.*` IPC channels.

---

## 5. NLU Engine + Command Palette

### 5.1 Intent Schema

| Intent | Maps to | Example |
|--------|---------|---------|
| `hire_employee` | `employees.create` | "Hire a senior backend engineer" |
| `fire_employee` | `employees.fire` | "Let go of James" |
| `promote_employee` | `employees.promote` | "Promote Sarah to lead" |
| `assign_ticket` | `tickets.assign` | "Assign the auth bug to Sarah" |
| `create_ticket` | `tickets.create` | "File a bug: login page 500 errors" |
| `close_ticket` | `tickets.close` | "Close ticket #42" |
| `reopen_ticket` | `tickets.reopen` | "Reopen the CSS regression" |
| `create_project` | `projects.create` | "Start a project for the redesign" |
| `create_goal` | `goals.create` | "Set a goal: ship v2.0 by June" |
| `call_meeting` | `meetings.call` | "All-hands with the design team" |
| `end_meeting` | `meetings.end` | "End the current meeting" |
| `check_status` | (read-only query) | "What's Sarah working on?" |
| `show_view` | (navigation) | "Show me cost breakdown this week" |
| `search_vault` | `vault.search` | "Find the API spec document" |
| `complex_request` | -> Copilot Agent | "Analyze why the frontend team is behind" |

### 5.2 Implementation

- **No new ML model.** The NLU uses the user's configured LLM provider via provider-router with a structured JSON output prompt: `{ intent, entities, confidence, missingSlots }`.
- **Entity extraction** resolves names to DB entities via fuzzy name match (employees) and FTS5 search (tickets, vault files).
- **Slot filling:** Missing required parameters trigger inline follow-up prompts in the palette.
- **Confirmation gate:** Destructive actions (fire, close, delete) require explicit confirmation. Non-destructive actions execute immediately with an undo toast.

### 5.3 Command Palette UI

- Triggered via `Cmd+K` / `Ctrl+K` globally.
- Text input at top with real-time NLU classification.
- Shows matched intent, resolved entities, and confidence below input.
- Structured command fallback: typing `/tickets.assign` bypasses NLU.
- History of recent commands (last 20, in settings key-value store).
- Full keyboard navigation (up/down through suggestions, Enter to execute, Esc to close).

### 5.4 New IPC Channels

| Channel | Request | Response |
|---------|---------|----------|
| `command.parse` | `{ text: string, companyId: string }` | `{ intent, entities, confidence, missingSlots, suggestedAction }` |
| `command.execute` | `{ intent: string, entities: Record<string, string>, confirmed: boolean }` | `{ success: boolean, result: any, error?: string }` |
| `command.suggest` | `{ partial: string, companyId: string }` | `{ suggestions: Array<{ text, intent, description }> }` |
| `command.history` | `{}` | `{ commands: Array<{ text, intent, timestamp }> }` |

---

## 6. RAG Pipeline (Agent Memory)

### 6.1 Database Schema

```sql
-- New migration: 0008_embeddings.sql

CREATE TABLE embeddings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('message', 'ticket', 'vault_file', 'meeting_minutes', 'goal', 'project')),
  source_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content_text TEXT NOT NULL,
  embedding BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(source_id, chunk_index)
);

CREATE INDEX idx_embeddings_company ON embeddings(company_id);
CREATE INDEX idx_embeddings_source ON embeddings(source_type, source_id);

-- sqlite-vec virtual table for ANN search
CREATE VIRTUAL TABLE vec_embeddings USING vec0(
  id TEXT PRIMARY KEY,
  embedding float[1536]
);
```

The embedding dimension (1536) is configurable via settings to match the user's embedding model. Default assumes OpenAI `text-embedding-3-small`. Local models (nomic-embed-text: 768, mxbai-embed-large: 1024) use their native dimension.

### 6.2 Embedding Generation (On-Write)

The intelligence package's RAG indexer subscribes to the event bus:

| Event | Action |
|-------|--------|
| `work.completed` | Embed the final assistant message content |
| (ticket created) | Embed ticket title + description |
| (ticket comment) | Embed the comment text |
| `meeting.ended` | Embed the generated minutes |
| (vault uploaded) | Embed extracted text content (from VaultService) |
| (goal created) | Embed goal title + description |
| (project created) | Embed project title + description |

For events without a dedicated event type (ticket/goal/project creation), the indexer detects them via the append-only events table using `source_type` markers.

**Embedding model selection:**
- Provider-router gets a new `embedText(texts: string[], provider: string, model: string): Promise<number[][]>` function.
- Local-first: Ollama with `nomic-embed-text` (768-dim) or `mxbai-embed-large` (1024-dim).
- Cloud: OpenAI `text-embedding-3-small` (1536-dim), or the provider's native embedding endpoint.
- Configurable in settings (`embedding_provider`, `embedding_model`, `embedding_dimension`).

**Chunking:** Content exceeding 512 tokens is split into overlapping chunks (512 tokens, 64 token overlap). Each chunk gets its own row in `embeddings` and `vec_embeddings`.

### 6.3 Retrieval at Agent Turn Time

The existing `resolveSystemPrompt` callback is extended (not replaced):

```
resolveSystemPrompt(employee, company, threadId)
  -> load role.md -> parse -> render template
  -> retrieve relevant context from RAG:
       query = last 2 user messages in thread
       filter = company_id match
       top-k = 5
       threshold = cosine similarity > 0.7
  -> deduplicate (skip if chunk already in thread history)
  -> append context section to system prompt:
       "## Relevant Context\n[Source: ticket #42] ...\n[Source: meeting 2026-04-10] ..."
  -> return enriched system prompt string
```

### 6.4 Context Window Management

| Parameter | Default | Configurable |
|-----------|---------|-------------|
| Max RAG context tokens | 2000 | Yes (`rag_max_tokens`) |
| Relevance threshold | 0.7 cosine similarity | Yes (`rag_threshold`) |
| Top-k results | 5 | Yes (`rag_top_k`) |
| Deduplication | Skip chunks already in thread | Always on |
| Source attribution | `[Source: type #id]` prefix per chunk | Always on |

---

## 7. Agent Collaboration Intelligence (Task Planner)

### 7.1 New Built-in Tools

| Tool | Available to Levels | Description |
|------|-------------------|-------------|
| `decompose_project` | Officer, Senior Mgmt, Management | Takes a goal/brief, returns a proposed ticket tree with assignments |
| `delegate_subtask` | Management, Supervisor, Lead | Creates a ticket and assigns it to a specific IC, with context |
| `review_deliverable` | Management, Supervisor, Lead | Reviews a completed ticket's output, approves or requests changes |

These are injected alongside existing built-in tools (`send_message_to_colleague`, `list_colleagues`) based on the employee's level from the role.md frontmatter.

### 7.2 Decomposition Flow

```
1. Manager agent receives project assignment (ticket or meeting action item)
2. Agent calls decompose_project({ brief, goalId?, projectId? })
3. Tool internally:
   a. Queries org chart for available ICs under this manager
   b. Queries RAG for similar past projects
   c. Queries ticket repo for current workload per employee
   d. Uses LLM (via provider-router) to generate decomposition plan:
      - List of subtasks with descriptions
      - Suggested assignee per subtask (role fit + workload)
      - Dependency ordering (which subtasks block others)
      - Estimated complexity (S/M/L)
4. Returns plan as structured JSON to the agent
5. Agent reviews plan (can adjust via follow-up tool calls)
6. Agent calls delegate_subtask for each approved subtask
7. Each delegated subtask:
   - Creates a ticket in the tickets table
   - Assigns to the suggested IC
   - Links to the parent project
   - Enqueues agent work via orchestrator
```

### 7.3 Guardrails

Enforced at the orchestrator/tool level, not in agent prompts:

| Guardrail | Default | Configurable |
|-----------|---------|-------------|
| Max tickets per decomposition | 10 | Yes (settings: `planner_max_tickets`) |
| Max depth (subtask of subtask) | 2 levels | Yes (settings: `planner_max_depth`) |
| Budget cap per project | No limit | Yes (per-project field) |
| Approval gate | Manager+ auto-approve; IC decompositions require Rocky | Yes (settings: `planner_approval_level`) |
| Concurrency cap | Respects existing per-provider caps | No (invariant #5) |
| Escalation trigger | 3 consecutive failures -> escalate to manager | Yes (settings: `planner_escalation_threshold`) |

### 7.4 Workload Scoring

The `delegate_subtask` tool uses a deterministic scoring function (no LLM call):

```
score(employee, subtask) =
  w1 * role_fit(employee.role, subtask.type)     // 0-1: parsed from role.md capabilities
  + w2 * (1 - load_ratio(employee))               // 0-1: open tickets / max capacity
  + w3 * availability(employee)                    // 0 or 1: not in meeting, not archived
  + w4 * past_performance(employee, subtask.type)  // 0-1: avg completion speed from runs

Default weights: w1=0.4, w2=0.3, w3=0.2, w4=0.1
```

### 7.5 New Event Types

| Event Type | Payload |
|-----------|---------|
| `plan.proposed` | `{ planId, projectId, subtasks: Array<{ title, assigneeId, complexity }> }` |
| `plan.approved` | `{ planId, approvedBy }` |
| `task.delegated` | `{ ticketId, assigneeId, parentProjectId, delegatedBy }` |
| `task.escalated` | `{ ticketId, escalatedTo, reason }` |
| `review.requested` | `{ ticketId, reviewerId }` |
| `review.completed` | `{ ticketId, reviewerId, outcome: 'approved' \| 'changes_requested' }` |

---

## 8. In-App AI Copilot

### 8.1 Architecture

The copilot is a **special system-level employee** with `role_id: system-copilot`. It exists in every company but does not appear in the org chart or employee list. It:

1. Subscribes to the event bus and maintains a rolling 100-event window per company (in-memory).
2. Runs periodic analysis (configurable interval, default 5 min) via the user's LLM provider.
3. Surfaces insights via a dedicated sidebar panel and dashboard widget.
4. Responds to direct questions via the command palette's `complex_request` fallback and a dedicated chat thread.

### 8.2 Insight Categories

| Category | Examples | Data Source |
|----------|----------|-------------|
| **Operational** | "Sarah has 3 blocked tickets", "No work dispatched in 2h" | Tickets, runs, events |
| **Cost/Performance** | "Cost 40% over last week", "Avg response time 3x slower" | Runs telemetry, cost breakdown |
| **Org/Hiring** | "Frontend team has no mobile IC", "CTO has 8 direct reports" | Org chart, role analysis |
| **Workflow** | "Ticket #42 in-progress for 3 days", "3 tickets unassigned" | Tickets, projects, goals |
| **Anomaly** | "Unusual error spike", "Agent X unresponsive 30 min" | Events, runs |

### 8.3 Insight Generation

```
Every N minutes (default 5, configurable):
  1. Collect: recent events (rolling window), open tickets, active runs, cost data, org chart
  2. Build structured analysis prompt (summarized data, not raw)
  3. LLM generates insights as JSON: [{ category, severity, title, detail, actionSuggestion, actionIntent? }]
  4. Deduplicate against previous active insights (title similarity > 0.8)
  5. Store new insights in copilot_insights table
  6. Emit copilot.insight events for high-severity findings (critical, warning)
  7. Expire insights older than their expires_at timestamp
```

### 8.4 Database Schema

```sql
-- Part of migration 0008 or separate 0009

CREATE TABLE copilot_insights (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('operational', 'cost', 'org', 'workflow', 'anomaly')),
  severity TEXT NOT NULL CHECK(severity IN ('critical', 'warning', 'info')),
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  action_suggestion TEXT,
  action_intent TEXT,
  action_entities_json TEXT,
  dismissed_at INTEGER,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_insights_company_active ON copilot_insights(company_id, dismissed_at, expires_at);
```

### 8.5 UI Surface

**Copilot sidebar panel** (right side, toggleable via `Cmd+Shift+K` or toolbar button):
- Insight feed sorted by severity (critical > warning > info).
- Each insight card: category icon, severity badge, title, detail text, suggested action button.
- Action buttons dispatch to `command.execute` pipeline.
- "Ask the copilot" text input at bottom for free-form questions.
- Dismiss button per insight (sets `dismissed_at`).

**Dashboard widget** (on the main Dashboard view):
- Top 3 active insights as compact cards.
- Severity color coding (red/amber/blue).
- "View all" link toggles the sidebar.

### 8.6 New IPC Channels

| Channel | Request | Response |
|---------|---------|----------|
| `copilot.insights` | `{ companyId, category?: string, limit?: number }` | `{ insights: CopilotInsight[] }` |
| `copilot.dismiss` | `{ insightId: string }` | `{ success: boolean }` |
| `copilot.ask` | `{ companyId: string, question: string }` | `{ answer: string, relatedInsights: CopilotInsight[] }` |
| `copilot.configure` | `{ intervalMinutes?: number, enabledCategories?: string[] }` | `{ success: boolean }` |

---

## 9. Milestone Breakdown

> **Resequenced 2026-04-15 (M31 T9).** The original plan split NLU (M30) and Command Palette UI (M31) across two milestones and had no dedicated milestone for the complex-request agentic loop — it was folded into M31 under the "System AI employee" line item. As built, M30 absorbed both the NLU engine *and* the palette UI (146 unit tests + 2 E2E specs across 11 tasks), and the agentic-loop work that originally lived in M31's "System AI employee" bullet grew into its own milestone. The table below reflects the actual shipped sequence. Downstream milestones (M32 Task Planner, M33 Copilot Service, M34 Copilot UI, M35 Demo + Hardening) keep their numbering; only their dependency pointers shift (M34 now depends on M30, since the palette ships there, not M31).

| # | Milestone | Status | Deps | Key Deliverables | Tests |
|---|-----------|--------|------|------------------|-------|
| **M28** | Intelligence package + RAG foundation | ✅ Complete (2026-04-13) | None | `packages/intelligence` scaffold, sqlite-vec embeddings table + migration 0008, embedding generation pipeline, provider-router `embedText` adapter, chunker, RAG settings keys | 29 |
| **M29** | RAG integration into agent turns | ✅ Complete (2026-04-13) | M28 | Event bus subscription for on-write indexing, `resolveSystemPrompt` enhancement with retrieval, context injection with dedup + attribution, RAG settings UI in Settings tab | 27 |
| **M30** | NLU Engine + Command Palette | ✅ Complete (2026-04-14) | M28 | Intent classifier (LLM-based JSON output), entity resolver (fuzzy match + FTS5), slot filler, `command.*` IPC channels + handlers + preload bridge, `Cmd+K` overlay with real-time NLU display, 15 intents, confirmation gates for 4 destructive intents, command history (last 20), slash-command fallback, canned-classifier E2E spec | 146 (+2 E2E) |
| **M31** | Agentic Loop (read-side) | 🚧 In progress — 9 of 11 tasks shipped (2026-04-15) | M30 | `system-agent` pseudo-employee (migration 0010, `is_system` column, hidden from org chart + delegation pickers), `@team-x/intelligence/loop/` ReAct scheduler (pure, provider-agnostic), 6 read-only repo-wrapping tools (`query_employees` / `query_tickets` / `query_projects` / `query_meetings` / `query_vault` / `query_events`), `AgenticLoopService` main-process front-door, CommandService `complex_request` dispatch, Copilot Conversations thread UX, palette step-log mode + `command.stop`, `agentic_max_steps` / `agentic_max_tokens` / `agentic_timeout_ms` settings, canned-provider E2E spec | 139 (+1 E2E) |
| **M32** | Task Planner (write-side) | ✅ Complete (2026-04-16) | M29, **M31** | `decompose_project`, `delegate_subtask`, `review_deliverable` tools (`agentic-tools-write.ts`), guardrail enforcement (level-gated tool injection per Phase 5 §7.1), deterministic workload scoring (locked §7.4 weights), six new `plan.*` / `task.*` / `review.*` event types in canonical `EventType` union, three new `AgentStepKind` variants (`ticket_created` / `delegation_made` / `review_pending`), write-side **amber** confirmation gate (Gate 2.5 in `command-service.ts`, distinct from M30 destructive **red** gate), four clamped `planner_*` settings keys + PlannerSection UI, `command.getRunSnapshot` IPC for step-stream backfill (closes F1), `useThreadList` bus invalidator (closes F2), canned `test-agentic-tools.ts` three-tier seam, `task-planner.spec.ts` E2E. Builds on M31's agentic-loop harness — swaps read-only tools for the write-side set. | 75 (+1 E2E) |
| **M33** | Copilot Service | ✅ Complete (2026-04-17) | M29, M31 | System-copilot pseudo-employee (second `is_system=1` row per company, hidden from every human-facing surface, `query_copilot_insights` introspection tool added to the read-only set), periodic `CopilotAnalyzerService` (5-min default cadence, clamped 1–60 min, pause-aware via the M31 polling wrapper, AbortController stop), `CopilotEventTrigger` (30s-debounced supplementary analysis on `meeting.ended` / `ticket.closed` / `goal.progressChanged` / `agentic.failed { budget_exhausted }`), `CopilotEventWindow` (in-memory bounded deque, 100 events/company, FIFO eviction, `token.delta` filtered, warm-start hydration), migration 0011 `copilot_insights` table (CHECK-constrained `category` + `severity`, composite `idx_insights_company_active`, FK `company_id ON DELETE CASCADE`) + migration 0012 `runs.kind` column, `CopilotInsightsRepo` with deterministic `upsertWithDedup` (category scope → numeric-drift guard → Jaccard bigram > 0.8), four `copilot.*` IPC channels (`insights` / `dismiss` / `ask` / `configure`), `copilot.ask` routing through the M31 agentic harness with `system-copilot` actor + level-gated `query_copilot_insights` tool, three clamped settings keys (`copilot_enabled` / `copilot_interval_minutes` / `copilot_categories`) + CopilotSection UI, four new event types (`copilot.analyzed` / `copilot.insight` / `copilot.dismissed` / `copilot.expired`), canned `test-copilot-provider.ts` three-tier seam (fourth member of the agentic-surface seam quartet), `copilot-service.spec.ts` E2E. | 66 (+1 E2E) |
| **M34** | Copilot UI + Dashboard widget | ✅ Complete (2026-04-18) | M33, **M30** | Sidebar panel (toggle, insight cards, action dispatch, dismiss, ask input), dashboard widget (top 3 + view all), `Cmd+Shift+K` shortcut wired through the M30 palette. Renderer-only — zero new IPC channels, zero new bus events. | 16 (all shipped) |
| **M35** | Demo + hardening | ✅ Complete (2026-04-20) | All | T0 plan doc (`docs/plans/2026-04-19-team-x-phase-5-m35-demo-hardening.md`), T1 performance defaults audit (+4 unit, all 10 clamps HELD on llama3.1:8b evidence), T2 cross-milestone integration E2E (`phase-5-integration.spec.ts`, +1 E2E / +1 Playwright case), T3 audit-view chips for 18 Phase 5 event types (+28 unit), T4 Phase 5 retrospective (271 lines, locked six-section structure), T5 demo walkthrough + 5 scenario docs (`docs/demo/`), T6 README + user-guide reconciliation sweep, T7 CHANGELOG `[Unreleased]` → `[1.1.0]` promotion, T8 version bump 1.0.0 → 1.1.0 across 7 `package.json` files + `Phase 5` badge freeze pin (+2 unit), T9 flaky-test audit + stable-selector sweep (+2 unit), T10 Phase 5 COMPLETE marker + v1.1.0 tag + `docs/user-guide/demo-walkthrough.md` (+3 unit release-marker tests). 1169 unit / 11 E2E specs (12 Playwright cases). | 39 (+1 E2E / +1 Playwright case) |

**Shipped:** +557 unit tests (M28 + M29 + M30 + M31 + M32 + M33 + M35) + 7 E2E specs / 8 Playwright cases across Phase 5. Final Phase 5 exit totals (2026-04-20, v1.1.0): **1169 unit tests / 11 E2E specs (12 Playwright cases)**, from the Phase 4 baseline of 612 / 4 (3.4 Playwright cases). M34 shipped renderer-only — 16 unit tests + 1 E2E / 1 Playwright case; M35 shipped +39 unit + 1 E2E / 1 Playwright case.

---

## 10. New IPC Channel Summary

| Namespace | Channel | Milestone | Description |
|-----------|---------|-----------|-------------|
| command | `command.parse` | M30 | Parse NL text into intent + entities |
| | `command.execute` | M30 | Execute a parsed command |
| | `command.suggest` | M30 | Autocomplete suggestions for partial input |
| | `command.history` | M30 | Recent command history |
| | `command.stop` | M31 | Cancel an in-flight agentic-loop run (fires AbortController, terminal step emitted as `canceled`) |
| settings | `settings.getAgentic` | M31 | Read `agentic_max_steps` / `agentic_max_tokens` / `agentic_timeout_ms` |
| | `settings.setAgentic` | M31 | Write clamped agentic-loop budget caps |
| copilot | `copilot.insights` | M33 | Active insights for company |
| | `copilot.dismiss` | M33 | Dismiss an insight |
| | `copilot.ask` | M33 | Free-form question to copilot (routes through the M31 agentic-loop harness) |
| | `copilot.configure` | M33 | Set analysis interval + categories |

Plus `settings.getCopilot` / `settings.setCopilot` (M33) for the three clamped copilot settings, and `command.getRunSnapshot` (M32) for `useAgentStepStream` backfill on mount.

**New bus event types** (append-only via `events` table):

| Event | Emitted by | Milestone | Payload |
|-------|------------|-----------|---------|
| `agent.step` | `AgenticLoopService` | M31 | `{ runId, threadId, step: { kind: 'plan' \| 'tool_call' \| 'tool_result' \| 'answer' \| 'error' \| 'ticket_created' \| 'delegation_made' \| 'review_pending', … } }` |
| `agentic.completed` | `AgenticLoopService` | M31 | `{ runId, threadId, finalAnswer, stepCount, tokensUsed, durationMs }` |
| `agentic.failed` | `AgenticLoopService` | M31 | `{ runId, threadId, reason: 'budget_exhausted' \| 'timeout' \| 'canceled' \| 'provider_error' \| 'tool_error', detail? }` |
| `plan.proposed` / `plan.approved` / `task.delegated` / `task.escalated` / `review.requested` / `review.completed` | `agentic-tools-write.ts` | M32 | See §9 M32 row + `packages/shared-types/src/events.ts` |
| `copilot.analyzed` | `CopilotAnalyzerService` (per tick) | M33 | `{ companyId, reason: 'periodic' \| 'manual' \| 'event', durationMs, insightsProposed, insightsPersisted, insightsMerged, insightsExpired }` |
| `copilot.insight` | `CopilotAnalyzerService` (per insert, NOT per merge) | M33 | `{ companyId, insightId, category, severity, title }` |
| `copilot.dismissed` | `copilot.dismiss` IPC handler | M33 | `{ companyId, insightId, dismissedAt }` |
| `copilot.expired` | `CopilotAnalyzerService` (per expiry sweep row) | M33 | `{ companyId, insightId, category, severity, title, expiredAt }` |

---

## 11. Settings Keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `rag_enabled` | boolean | true | Enable/disable RAG context injection |
| `rag_max_tokens` | number | 2000 | Max tokens of RAG context per agent turn |
| `rag_threshold` | number | 0.7 | Cosine similarity threshold |
| `rag_top_k` | number | 5 | Number of retrieval results |
| `embedding_provider` | string | (auto) | Provider for embedding generation |
| `embedding_model` | string | (auto) | Model for embedding generation |
| `embedding_dimension` | number | 1536 | Vector dimension |
| `copilot_enabled` | boolean | true | Enable/disable copilot analysis |
| `copilot_interval_minutes` | number | 5 | Analysis interval |
| `copilot_categories` | string[] | all | Enabled insight categories |
| `planner_max_tickets` | number | 10 | Max tickets per decomposition |
| `planner_max_depth` | number | 2 | Max subtask nesting depth |
| `planner_approval_level` | string | 'management' | Min level for auto-approve |
| `planner_escalation_threshold` | number | 3 | Failures before escalation |
| `agentic_max_steps` | number | 8 | Max loop iterations before `budget_exhausted` (M31) |
| `agentic_max_tokens` | number | 8000 | Cumulative token budget across loop (M31) |
| `agentic_timeout_ms` | number | 120000 | Wall-clock deadline per run (M31) |

---

## 12. Invariants Preserved

All 10 existing invariants from the v1.0 design doc remain intact:

1. **Renderer is a pure view.** Command palette and copilot sidebar call IPC — no direct LLM calls.
2. **Orchestrator is the only scheduler.** Planner tools enqueue work via the existing orchestrator, not independently.
3. **MCP Host is a singleton.** No new MCP connections; planner tools are built-in, not MCP.
4. **Storage is SQLite + filesystem vault.** Embeddings in SQLite, no new storage layer.
5. **Provider router is the only LLM touch-point.** NLU, RAG embedding, copilot analysis, and planner decomposition all route through provider-router.
6. **Events table is append-only.** New event types added, append-only contract preserved.
7. **Zero phone-home.** Copilot analysis is local. Embeddings are local. No external telemetry.
8. **Secrets in OS keychain.** No new secret storage patterns.
9. **Role-pack overrides preserved.** Planner respects role.md capabilities for workload scoring.
10. **Runtime strategy is adaptive.** RAG and copilot respect privacy tier and concurrency caps.

---

## 13. Decisions Log

| # | Decision | Rationale | Status |
|---|----------|-----------|--------|
| D1 | Intelligence as a separate package, not orchestrator extension | Keeps orchestrator as a clean scheduler; intelligence is testable in isolation | Locked |
| D2 | LLM-based NLU (no custom ML model) | Users already have LLM providers configured; adding a separate NLU model adds deployment complexity | Locked |
| D3 | On-write embedding generation (not on-read) | Amortizes cost across writes; agent turns stay fast; event bus provides natural hook | Locked |
| D4 | sqlite-vec for vector storage | Already in the stack (CLAUDE.md); no new dependency; works with better-sqlite3 | Locked |
| D5 | Copilot as system-level employee (not a service process) | Reuses existing chat infrastructure; can be talked to like any employee; appears in threads naturally | Locked |
| D6 | Guardrails enforced at tool level, not prompt level | Prompts are advisory; tool-level enforcement is deterministic and can't be jailbroken | Locked |
| D7 | Workload scoring is deterministic (no LLM) | Scoring must be fast, reproducible, and auditable; LLM adds latency and non-determinism to delegation | Locked |
| D8 | M31 ships read-side tools only; write-side moves to M32 | Lets the agentic loop surface useful answers *now* without also needing to approve ticket creation/deletion. Keeps the scheduler testable before tool-permission complexity lands | Locked (2026-04-14) |
| D9 | Complex-request thread persists on a per-company `system-agent` pseudo-employee, not on the user | Thread history is discoverable in a dedicated "Copilot Conversations" section; keeps user DMs uncluttered; sets up M33 (Copilot Service) to reuse the same seat | Locked (2026-04-14) |
| D10 | Agentic-loop tools are built-in main-process closures over repos, NOT MCP servers | Preserves MCP-host singleton invariant; avoids N MCP connections per loop run; repo closures are faster, type-safe, and audit-trailed by default | Locked (2026-04-14) |
| D11 | Write-side gate is a keyword heuristic over `complex_request` text, not a separate intent | Keeping `complex_request` as the single agentic-loop entry point keeps the classifier stable; a dedicated `write_request` intent would force every spec to script a new classifier branch. The keyword regex (decompose / delegate / create tickets / assign owners / review) catches the common write phrasings without growing the intent surface | Locked (2026-04-15) |
| D12 | Escalation tracker is in-memory per-process, not persisted | After-`planner_escalation_threshold` failures escalate up the org chart, but the failure counter resets on app restart. Persisting it would require a new `escalation_state` table for a feature that fires only when delegation is genuinely broken; the simpler design is to surface escalations as `task.escalated` events (which ARE persisted via the append-only events table) and let the manager's queue absorb the work. M33 may revisit if escalations need cross-session continuity | Locked (2026-04-15) |
| D13 | Performance-defaults audit HOLDS all 10 Phase 5 settings clamps on measurement evidence, rather than proactively tuning for headroom | llama3.1:8b + Ollama + analyzer-shaped prompt (67 bounded events / 2288 chars / 734 prompt tokens) runs cold in 208s and warm in 66s. That leaves 0.55× utilisation against `agentic_timeout_ms=120000`, 4.5× headroom against the 5-min copilot cadence, and 4× headroom against the 8000-token `agentic_max_tokens` budget. Moving defaults down without load evidence from a real deployment would be premature optimisation; moving them up without ceiling evidence would mask latent issues. Seed.ts carries the full measurement block as the authoritative source of the numbers, so future tuning in Phase 6+ has a defensible starting line | Locked (2026-04-19 — M35 T1) |
| D14 | Phase 5 exit is marked by v1.1.0 + the CLAUDE.md Phase 5 COMPLETE literal + Phase 5 design doc §9 M35 row flipped 📋 → ✅, pinned by three source-string-audit unit tests | Release markers are historically easy to leave half-done. The three pins in `apps/desktop/src/phase-5-complete-marker.test.ts` (CLAUDE.md literal + §9 M35 ✅ Complete row + CONTINUITY.md Phase 5 COMPLETE header) are the belt-and-suspenders guard against an "in progress but v1.1.0 tagged" ambiguous state. The v1.1.0 git tag points at the T10 LEDGER commit (not the atomic work commit) so the tagged SHA is the final Phase 5 SHA | Locked (2026-04-20 — M35 T10) |

**Phase 5 retrospective:** The full Phase 5 delivery arc (M28 → M35), what paid off architecturally, what cost time, what got deferred, and prioritized Phase 6 seeds are captured in [`docs/plans/2026-04-19-team-x-phase-5-retrospective.md`](2026-04-19-team-x-phase-5-retrospective.md) (authored during M35 T4 as the Phase 5 exit-gate documentation). Future phase retros MUST match the locked six-section structure from that doc so delivery-arc comparisons remain apples-to-apples.

---

## 14. Follow-ups (post-M31)

Two paper-cuts surfaced during M31 T8 (E2E round-trip) and were carried into M32 as T0 + T1. **Both are now closed.**

| # | Follow-up | Root cause | Resolution | Size |
|---|-----------|------------|------------|------|
| **F1** | `useAgentStepStream` needs backfill on mount | Under the canned test provider the loop completes faster than React Query can attach its bus subscription. Only the terminal `answer` card is reliably observed live in the palette's step-log mode; intermediate `plan` / `tool_call` / `tool_result` steps arrive on the bus before any subscriber attaches. The persisted thread (Copilot Conversations drawer) gets all steps correctly because the chat-drawer refetches on mount. | **CLOSED in M32 T0 (commit `f515ea7`).** New wire type `AgenticRunSnapshot` + `command.getRunSnapshot` IPC + `AgenticLoopService.getRunSnapshot()` projection + hook backfill with `(runId, stepIndex)` dedup against late-arriving bus events. The `task-planner.spec.ts` E2E confirms the backfill works end-to-end (observed step count = 7 in the palette step log). | +6 unit tests, ~120 LOC |
| **F2** | `useThreadList` has no `agent.*` bus invalidator | A thread list opened before a complex-request run completes shows stale "No threads yet" copy until a manual refetch. The E2E spec sidesteps by routing through the palette's "Open Thread" deep-link. | **CLOSED in M32 T1 (commit `62a0504`).** `useThreadList` subscribes to `agentic.completed` / `agentic.failed` on the dashboard bus and invalidates `['threads', companyId]` so Copilot Conversations populates live without manual refetch. | 0 new unit tests (covered by existing thread-list tests + E2E), ~2 LOC |

---

## 15. Follow-ups (post-M32)

No paper-cuts surfaced during M32 T8 (E2E round-trip). The M31 follow-up class — race conditions between bus emit and React Query subscription attach — is closed by F1's `getRunSnapshot` backfill pattern, which is now the canonical way to reconcile a fast loop with a slow renderer subscription. Future write-side tool surfaces should follow the same backfill-on-mount pattern.

---

## 16. Follow-ups (post-M33)

| ID | Surface | Description | Disposition | Cost |
|---|---------|-------------|-------------|------|
| **F3** | `CopilotEventWindow.clear(companyId)` not wired to `companies.archive` | The window's `clear(companyId)` public method exists and is unit-tested, but nothing calls it because the `companies.archive` IPC channel does not exist in the codebase today (companies repo has `create` / `getById` / `getBySlug` / `list` / `setStatus` only). Zero-surface-area until that IPC lands. | **DEFERRED.** Wire on the same milestone that introduces `companies.archive`. Documented in `copilot-event-window.ts` §5 design notes. | 0 net (already implemented, just not wired) |
| **F4** | Backup/restore does not re-bootstrap `system-copilot` for pre-M33 backups | The M23 backup/restore path predates the `is_system` column (migration 0010) and the `system-copilot` row (M33 T2). Restoring a pre-M33 backup leaves no system-copilot row. | **DEFERRED.** Add a `backupService.ensurePostRestoreSystemEmployees()` pass in M34 or later. Workaround: delete the SQLite file and let `seedIfEmpty` re-bootstrap. | ~30 LOC |

The M33 architectural seams — three-tier canned test seam (now four-member), pause-aware `providerRouter.complete` wrapper, AbortController stop, `is_system` filter-sweep with `isSystemRoleId` predicate, atomic + ledger commit cadence, ABI rebuild dance on verification — all carry forward to M34 unchanged. M34 (Copilot UI) is a renderer-only milestone that consumes the M33 IPC surface; no new bus events, no new IPC channels, no new providers.
