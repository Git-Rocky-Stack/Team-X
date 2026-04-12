# Team-X Phase 2 (The Org) — Design & Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Phase 1 single-CEO skeleton into a full multi-agent organization. Users create companies, hire from a curated role library, build org charts with real hierarchy, wire MCP tools, and file tickets that agents pick up and close autonomously.

**Phase 2 demo target:** *"File a ticket, an agent picks it up, uses an MCP, and closes it."*

**Phase 1 baseline (what exists):** Electron boots, SQLite + Drizzle, 1 hardcoded company (Strategia-X), 2 employees (CEO + Sr SWE), adaptive provider router (Anthropic + Ollama), orchestrator streaming live over IPC, dashboard cards with live token streams, chat drawer, hire dialog, 324 unit tests + 1 Playwright E2E.

---

## Scope decisions (locked with Rocky 2026-04-11)

| Decision | Choice |
|----------|--------|
| Role count for Phase 2 | ~20 hand-written F10 roles across all 6 hierarchy levels. Remaining ~35 added incrementally post-demo. |
| MCP scope | Full Rocky stack pre-wired: Context7, browse, episodic-memory, Supabase, and any others from Rocky's Claude Code environment. |
| Multi-company depth | Full isolation — per-company MCP configs, per-company provider preferences, workspace switcher. |

## Scope guardrails (Phase 3+)

Phase 2 deliberately **excludes**:

- Meeting primitive (pause/resume all agents, minutes, action items)
- Goals & projects (OKR hierarchy, project → ticket decomposition)
- Telemetry dashboard UI (runs table exists from Phase 1, but no UI beyond the existing cards view)
- File vault + blob storage (SHA256 integrity, size-unlimited files)
- Backup/restore + audit log UI
- Hardware profiling + adaptive runtime modes (Auto/Hybrid/Always-On/Lean)
- Vector store / memories / embeddings (sqlite-vec deferred)
- Community role packs + signature verification
- Provider support beyond Anthropic + Ollama (OpenAI, Groq, OpenRouter, Google, Together, Fireworks — Phase 3+)
- Worker threads (stay on async concurrency in main; benchmark in Phase 3)

---

## Milestones overview

| # | Milestone | Deliverable |
|---|-----------|-------------|
| M7 | Multi-company + workspace | Company CRUD, top-bar switcher, per-company settings (MCP configs, provider prefs) |
| M8 | Role pack system + 20 roles | Full loader (directory scan, watch, version tracking, overrides), role browser UI, ~20 F10 roles |
| M9 | Org chart + hire/fire/promote | `org_edges` table, tree visualization, hire-from-role flow, fire/promote, basic drag-rearrange |
| M10 | MCP host + tool calling | Singleton MCP pool, full Rocky stack, per-company enable/disable, tools_allowed/denied enforcement |
| M11 | Employee-to-employee messaging | Agent-to-agent threads via orchestrator, serialization, UI |
| M12 | Tickets + kanban | Ticket CRUD, kanban board, assign-to-agent enqueues WorkItem, agent uses MCPs to close ticket |
| M13 | Demo + hardening | Full demo walkthrough, Playwright E2E, CLAUDE.md update, phase-2 tag |

Review checkpoints after every milestone. Do not blast through checkpoints.

---

# Milestone 7 — Multi-company + workspace

## What exists (Phase 1)

- `companies` table with id, name, slug, settings_json, icon, theme
- `companies` repo: create, getBySlug, getById, list
- Seed creates Strategia-X on first boot
- App.tsx discovers company id via `window.teamx.companies.list()` and uses the first one
- Top-bar hardcodes "Strategia-X" + "Phase 1" badge

## What M7 delivers

1. **Company CRUD IPC:** `companies.create`, `companies.update`, `companies.delete` handlers. Delete is soft-delete (archived flag) — never lose data.

2. **Company settings schema expansion:** Add columns/JSON fields for:
   - `mcp_configs_json` — per-company MCP enable/disable + connection overrides
   - `provider_prefs_json` — per-company default provider, model tier preferences, privacy filter
   - `max_concurrent_agents` — per-company concurrency cap (overrides global)

3. **Workspace switcher UI:** Top-bar dropdown shows all companies. Clicking switches the active company. Zustand `companyId` drives all queries. New "Create Company" option in the dropdown with a dialog (name, slug, icon, mission, values).

4. **Settings panel (stub):** Company settings page accessible from the top-bar menu. Phase 2 wires the MCP + provider sections; remaining settings come in later phases.

5. **Seed update:** Keep Strategia-X as the default seed, but make seed idempotent and respect existing companies.

## DB changes

- Migration: add `archived_at` column to `companies`
- Migration: add `mcp_configs_json`, `provider_prefs_json`, `max_concurrent_agents` to `companies` (or extend `settings_json`)
- No new tables

## New IPC channels

- `companies.create` → `{ id: string }`
- `companies.update` → `void`
- `companies.delete` → `void` (soft-delete)

## Tests

- Company CRUD repo tests (create, update, archive, list-excludes-archived)
- IPC handler tests (create, update, delete roundtrip)
- Renderer: workspace switcher renders, switches, creates new company

---

# Milestone 8 — Role pack system + 20 roles

## What exists (Phase 1)

- `@team-x/role-schema`: parseRoleMarkdown (zod validation, sha256), renderRoleBody (template vars)
- `role-loader` service: scans role-packs dir, indexes by id, resolves system prompt
- 2 role.md files: CEO + Senior Fullstack Engineer in `role-packs/strategia-official/`
- pack.json manifest for strategia-official

## What M8 delivers

1. **Full pack loader with hot-reload:** Watch the role-packs directory for changes. Re-index on file change. Expose `roleLoader.listRoles()`, `roleLoader.getRolesByLevel()`, `roleLoader.getSpec(id)`.

2. **Role override system:** User edits to role.md are saved as JSON override files in `~/.team-x/overrides/<pack-id>/<role-id>.json`. The loader merges overrides on top of the base role. Upstream pack updates never clobber user customizations. Override fields: temperature, tools_allowed, tools_denied, preferred_providers, preferred_model_tier, body sections.

3. **~20 F10 roles across all 6 levels:**

   | Level | Roles |
   |-------|-------|
   | Officer | CEO, CTO, COO |
   | Senior Management | VP Engineering, VP Product, VP Marketing |
   | Management | Engineering Manager, Product Manager, Design Manager |
   | Supervisor | Tech Lead, QA Lead, DevOps Lead |
   | Lead | Staff Engineer, Senior Product Manager, Design Lead |
   | IC | Senior SWE (exists), Frontend Developer, Backend Developer, UI/UX Designer, QA Engineer, DevOps Engineer, Data Analyst |

   Each role: full frontmatter (all fields from shared-types RoleFrontmatter), structured body (Identity, Mission, Operating Principles, Responsibilities, Decision Framework, Communication Style, Escalation Rules, Tool Usage, Output Format, Quality Bar). F10 quality — written as if Rocky will read them to investors.

4. **Role browser UI:** Replace the Phase 1 hire dialog's hardcoded 2-option list with a searchable role catalog. Filter by level, search by name/keyword. Preview panel shows the role's Identity + Responsibilities sections. "Hire" button proceeds to name + assignment.

5. **Role detail/edit panel:** View a hired employee's current role spec. Edit temperature, tools_allowed/denied inline. Changes saved as overrides.

## DB changes

- Migration: add `role_overrides` table (employee_id FK, override_json, updated_at)
- Or: per-employee override stored in existing `employees` table as `override_json` column

## New IPC channels

- `roles.list` → `RoleSummary[]` (id, name, level, description snippet)
- `roles.getSpec` → `RoleSpec` (full parsed role with rendered body)
- `roles.listByLevel` → `RoleSummary[]`
- `employees.updateOverrides` → `void`

## Tests

- Role loader: scan directory, index all 20, hot-reload on file change
- Override system: merge override on top of base, user fields win, missing fields fall through
- Integration: parse all 20 real role.md files
- Role browser UI: renders catalog, filters, previews

---

# Milestone 9 — Org chart + hire/fire/promote

## What M9 delivers

1. **`org_edges` table:** Stores manager → report directed edges. An employee can have one manager. A manager can have many reports. The root (CEO) has no manager. Enforced constraint: no cycles.

2. **Hire flow (expanded):** User picks a role from the catalog (M8), assigns a display name + optional avatar, places in the org chart by selecting a manager. Creates the employee row + org_edge. The orchestrator immediately has a new employee in the queue — no restart needed.

3. **Fire flow:** Soft-delete the employee (archived_at timestamp). Reassign their reports to their manager. Close their open tickets. The orchestrator removes them from the dispatch pool.

4. **Promote flow:** Change an employee's role. Preserves their chat history, thread memberships, and overrides. Updates the role_id + role_md_sha. The orchestrator picks up the new system prompt on the next turn.

5. **Org chart visualization:** Tree layout rendered with a React tree component (or custom SVG). Shows hierarchy levels with color-coding. Click node → employee detail panel. Basic drag-to-rearrange (change manager).

6. **Org chart view tab:** New "Org Chart" tab in the top bar (replacing the disabled Phase 2+ placeholder). Shows the org chart for the active company.

## DB changes

- Migration: add `org_edges` table (id, company_id, manager_id, report_id, created_at)
- Migration: add `archived_at` column to `employees`

## New IPC channels

- `employees.hire` → `{ employeeId: string }` (expanded from Phase 1's `employees.create`)
- `employees.fire` → `void`
- `employees.promote` → `void`
- `employees.setManager` → `void`
- `orgchart.get` → `OrgChartNode[]` (tree structure for the active company)

## Tests

- Org edges repo: create edge, list reports, get manager, detect cycles, cascade on fire
- Hire/fire/promote integration tests
- Org chart rendering (snapshot test or E2E)

---

# Milestone 10 — MCP host + tool calling

## What M10 delivers

This is the most architecturally significant milestone. Agents go from "can only chat" to "can use real tools."

1. **MCP client integration:** Use `@modelcontextprotocol/sdk` TypeScript SDK. Create a `McpHost` class in Main that manages a pool of MCP client connections. Each connection is a stdio or SSE transport to a running MCP server.

2. **Pre-wired Rocky stack:** Configure the following MCPs as globally available:
   - `context7` — documentation lookup
   - `browse` / `gstack` — headless web browsing
   - `episodic-memory` — cross-session memory
   - `supabase` — database operations
   - Any additional MCPs from Rocky's environment (discovered at runtime from a config file)

3. **Per-company MCP configs:** The `mcp_configs_json` field from M7's company settings drives which MCPs are enabled for each company. A company can disable any global MCP or add company-specific ones. UI: settings panel MCP section with toggle switches.

4. **tools_allowed / tools_denied enforcement:** Before dispatching a tool call from an agent, the MCP host checks the employee's role.md `tools_allowed` and `tools_denied` lists. Denied tools return a clear error message to the agent ("Tool X is not available for your role"). This is enforced at the HOST level, not in the prompt — agents cannot bypass it.

5. **Agent tool-call routing:** The orchestrator's `runAgent` function is extended to pass `tools` to the AI SDK's `streamText` call. When the model emits a tool call:
   - The orchestrator intercepts it
   - Routes to McpHost via message passing (not direct import)
   - McpHost executes against the appropriate MCP server
   - Result is fed back into the conversation
   - The agent continues reasoning

6. **Tool call telemetry:** Each tool call is recorded in the `runs` table (or a new `tool_calls` table) with: tool name, MCP server, input, output (truncated), latency, success/failure.

## DB changes

- Migration: add `mcp_servers` table (id, company_id nullable for global, name, transport, config_json, enabled)
- Migration: add `tool_calls` table (id, run_id, tool_name, mcp_server_id, input_json, output_json, latency_ms, status, created_at)

## New IPC channels

- `mcp.list` → `McpServerConfig[]` (available MCPs for active company)
- `mcp.toggle` → `void` (enable/disable an MCP for a company)
- `mcp.addServer` → `{ id: string }` (register a new MCP server)
- `mcp.removeServer` → `void`
- `mcp.testConnection` → `{ ok: boolean; error?: string }`

## Architecture invariant reminder

> **MCP Host is a singleton in Main.** One pool of MCP connections; agents request tool calls via message passing. Never spawn N MCP clients from N workers.

## Tests

- McpHost: connect, list tools, execute tool call, disconnect
- Tool-call routing: agent emits tool_use → host executes → result fed back
- tools_allowed / tools_denied enforcement
- Per-company MCP filtering
- Integration: real MCP server (use a simple echo MCP for testing)

---

# Milestone 11 — Employee-to-employee messaging

## What M11 delivers

1. **Agent-to-agent threads:** The orchestrator supports a new event type `message.agent_to_agent`. When an agent's response includes a directive to message another employee (detected via a structured output format or tool call), the orchestrator:
   - Creates or reuses a DM thread between the two employees
   - Appends the message
   - Enqueues a work item for the recipient (they "read" and "respond")

2. **Serialization:** An employee can only have ONE outgoing message being composed at a time. The orchestrator enforces this — if employee A is already thinking, a new inbound message from employee B queues behind the current work item.

3. **Thread routing:** Threads gain a `kind` field (already exists: dm, group, meeting, ticket, broadcast). M11 uses `dm` (1:1) and `group` (multi-agent). The orchestrator routes messages to the correct thread based on participants.

4. **UI updates:** Chat drawer shows employee-to-employee threads alongside human-to-employee threads. A subtle badge or icon distinguishes "agent-to-agent" conversations. Users can observe but not interrupt agent-to-agent threads (read-only in Phase 2).

## DB changes

- No new tables — uses existing `threads`, `thread_members`, `messages`
- May add `is_agent_initiated` boolean to messages for UI filtering

## New IPC channels

- `chat.listThreads` → `Thread[]` (all threads for active company, including agent-to-agent)
- Existing `chat.list` and `chat.send` extended to support agent-authored messages

## Tests

- Agent sends message to another agent via orchestrator
- Serialization: two inbound messages queue correctly
- Thread creation/reuse for agent DMs
- UI: agent threads render, read-only for human

---

# Milestone 12 — Tickets + kanban

## What M12 delivers

This is the **Phase 2 demo milestone.**

1. **Ticket schema:** `tickets` table with: id, company_id, title, description, status (open/in-progress/blocked/done), priority (low/medium/high/critical), assignee_id (employee FK), reporter_id (human or employee), labels_json, dependencies_json, sla_hours, due_at, created_at, updated_at, closed_at.

2. **Ticket CRUD:** IPC handlers for create, update, assign, close, reopen, addComment, listByCompany, listByAssignee, getById.

3. **Kanban board UI:** New "Tickets" tab in the top bar. Four columns: Open, In Progress, Blocked, Done. Cards show title, priority badge, assignee avatar, SLA indicator. Drag between columns to change status. Click card → ticket detail panel.

4. **Ticket assignment triggers agent work:** When a ticket is assigned to an employee (via UI drag or explicit assignment), the system:
   - Creates a thread for the ticket (kind: `ticket`)
   - Posts the ticket description as the first message
   - Enqueues a WorkItem for the assignee
   - The orchestrator picks it up, loads the agent's role + tools, runs the turn
   - The agent reads the ticket, uses MCPs (browse for research, Context7 for docs, etc.), and posts a response
   - If the agent determines the ticket is complete, it can request status change to "done"

5. **Ticket comments thread:** Each ticket has an associated thread. Human and agent messages appear in the ticket detail panel. Humans can comment to provide more context or redirect the agent.

6. **Agent ticket completion:** The agent can emit a structured "close ticket" action (via tool call or structured output). The orchestrator validates and closes the ticket, recording the resolution.

## DB changes

- Migration: add `tickets` table (full schema above)
- Migration: add `ticket_id` column to `threads` table (nullable FK to tickets)

## New IPC channels

- `tickets.create` → `{ ticketId: string }`
- `tickets.update` → `void`
- `tickets.assign` → `void` (triggers WorkItem)
- `tickets.close` → `void`
- `tickets.reopen` → `void`
- `tickets.addComment` → `{ messageId: string }`
- `tickets.list` → `Ticket[]`
- `tickets.get` → `Ticket` (with thread messages)

## Tests

- Ticket CRUD repo tests
- Assignment → WorkItem → agent runs → ticket closed integration test
- Kanban board renders, drag changes status
- Playwright E2E: file ticket → assign → agent uses MCP → closes

---

# Milestone 13 — Demo + hardening

## What M13 delivers

1. **Full demo walkthrough:** Verify the Phase 2 demo end-to-end:
   - Create a new company
   - Hire a team (CEO, CTO, PM, 2 SWEs) from the role catalog
   - View the org chart
   - File a ticket: "Research the latest React 19 Server Components patterns and write a summary"
   - Assign to the Senior SWE
   - Watch the agent pick it up, use Context7 MCP to look up React docs, write the summary
   - Agent closes the ticket
   - View the completed ticket in kanban

2. **Playwright E2E:** Extend the smoke test with a ticket-flow spec. Uses test-mode MCP (canned tool results) so CI has no network dependency.

3. **CLAUDE.md update:** Phase 2 commands, new IPC channels, MCP configuration docs, troubleshooting.

4. **`phase-2` tag** after sign-off.

---

## New shared-types additions needed

```ts
// tickets
export type TicketStatus = 'open' | 'in-progress' | 'blocked' | 'done';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Ticket {
  id: string;
  companyId: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId: string | null;
  reporterId: string;
  reporterKind: AuthorKind;
  labelsJson: string;
  dependenciesJson: string;
  slaHours: number | null;
  dueAt: number | null;
  threadId: string | null;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
}

// org chart
export interface OrgEdge {
  id: string;
  companyId: string;
  managerId: string;
  reportId: string;
}

export interface OrgChartNode {
  employee: Employee;
  children: OrgChartNode[];
}

// MCP
export interface McpServerConfig {
  id: string;
  companyId: string | null; // null = global
  name: string;
  transport: 'stdio' | 'sse';
  configJson: string;
  enabled: boolean;
}

// IPC extensions
export interface IpcContract {
  // ... existing channels ...
  'companies.create': { request: CreateCompanyRequest; response: { id: string } };
  'companies.update': { request: UpdateCompanyRequest; response: void };
  'roles.list': { request: void; response: RoleSummary[] };
  'roles.getSpec': { request: { roleId: string }; response: RoleSpec };
  'employees.hire': { request: HireRequest; response: { employeeId: string } };
  'employees.fire': { request: { employeeId: string }; response: void };
  'orgchart.get': { request: { companyId: string }; response: OrgChartNode[] };
  'mcp.list': { request: { companyId: string }; response: McpServerConfig[] };
  'mcp.toggle': { request: { serverId: string; enabled: boolean }; response: void };
  'tickets.create': { request: CreateTicketRequest; response: { ticketId: string } };
  'tickets.assign': { request: { ticketId: string; assigneeId: string }; response: void };
  'tickets.list': { request: { companyId: string }; response: Ticket[] };
  // ... etc
}
```

---

## Testing strategy

- **Unit tests (Vitest):** Every repo, service, and handler gets TDD coverage. Target: ~500+ tests by end of Phase 2.
- **Integration tests (Vitest):** MCP host + echo MCP server, ticket assignment → agent run → close flow, org chart cycle detection, role override merge.
- **E2E tests (Playwright):** Phase 1 smoke (maintained), Phase 2 ticket-flow smoke (new).
- **Test-mode MCP:** A simple echo/canned MCP server that returns deterministic results for CI. No real Context7/browse/Supabase in CI.

---

## Risk log

| Risk | Mitigation |
|------|-----------|
| MCP SDK stability (pre-1.0) | Pin exact version, wrap in adapter layer, integration test on every upgrade |
| 20 F10 roles is a week of writing | Parallelize with technical milestones — roles can be written while MCP/tickets are built |
| Org chart UI complexity | Start with a simple indented-list tree, upgrade to SVG/canvas in Phase 3 if needed |
| Agent tool-call loops (agent keeps calling tools forever) | Hard cap: max 10 tool calls per turn, configurable per role |
| MCP server crashes | McpHost reconnects on failure, logs error, agent gets a clear "tool unavailable" message |
| Multi-company data leaks | Every query includes `WHERE company_id = ?`, enforced at repo layer, integration-tested |

---

*End of Phase 2 design. Next: detailed task-by-task implementation plan (invoke writing-plans skill).*
