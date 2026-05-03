# Team-X Database Schema

**Version:** 2.0.3  
**Engine:** SQLite (WAL mode)  
**ORM:** Drizzle ORM  
**Migrations:** `apps/desktop/src/main/db/migrations/`

## Overview

Team-X uses SQLite as its primary data store. The schema is organized into functional domains:

- **Core**: Companies, employees, threads, messages, events
- **Work**: Tickets, goals, projects, meetings
- **AI**: Runs, embeddings, RAG, copilot insights
- **Extensions**: MCP servers, skills, authority
- **Governance**: Budgets, approvals, artifacts
- **Runtime**: Profiles, sessions, heartbeats
- **Proactive**: Routines, agent wakeup queue

## Schema Design Principles

1. **Primary Keys**: Text-typed nanoid values (URL-safe, sortable)
2. **Timestamps**: Integer UNIX milliseconds (language-neutral, sortable)
3. **Money**: Decimal strings to avoid float drift (`cost_usd` TEXT)
4. **JSON Blobs**: Text columns with `_json` suffix; callers `JSON.parse/stringify`
5. **Foreign Keys**: Declared in schema; enforced via `PRAGMA foreign_keys = ON`
6. **No File Blobs**: Files stored on disk; metadata only in DB (invariant #4)

## Core Tables

### `companies`

AI company instances. Multi-tenant root.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `name` | TEXT | NOT NULL | Display name |
| `slug` | TEXT | NOT NULL, UNIQUE | URL-safe identifier |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `settings_json` | TEXT | NOT NULL, DEFAULT '{}' | Company-scoped settings |
| `icon` | TEXT | | Emoji or icon identifier |
| `theme` | TEXT | NOT NULL, DEFAULT 'dark' | 'dark' \| 'light' |
| `status` | TEXT | NOT NULL, DEFAULT 'running' | 'running' \| 'meeting' \| 'paused' |
| `workspace_origin_id` | TEXT | | Portability lineage |
| `company_origin_id` | TEXT | | Portability lineage |
| `cloud_workspace_id` | TEXT | | Team-X Cloud linkage |
| `cloud_tenant_id` | TEXT | | Team-X Cloud tenant |
| `cloud_link_state` | TEXT | NOT NULL, DEFAULT 'unlinked' | 'unlinked' \| 'linked' \| 'error' |
| `linked_device_id` | TEXT | | Device identity for cloud sync |
| `last_synced_cursor_json` | TEXT | | Sync bookmark |
| `last_snapshot_id` | TEXT | | Last snapshot identifier |
| `last_sync_at` | INTEGER | | Last successful sync (ms) |
| `last_sync_error` | TEXT | | Last sync error message |

**Indexes:**
- `idx_companies_workspace_origin` on `workspace_origin_id`
- `idx_companies_company_origin` on `company_origin_id`
- `idx_companies_cloud_workspace` on `cloud_workspace_id`
- `idx_companies_cloud_link_state` on `cloud_link_state`

### `operators`

Human supervisors (local or cloud).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `display_name` | TEXT | NOT NULL | Human-readable name |
| `email` | TEXT | | Email address |
| `auth_mode` | TEXT | NOT NULL, DEFAULT 'local' | 'local' \| 'invited' \| 'cloud' |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

### `operator_memberships`

Company-scoped operator access.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `operator_id` | TEXT | FK → operators.id, NOT NULL | |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `role` | TEXT | NOT NULL | 'owner' \| 'admin' \| 'operator' \| 'reviewer' |
| `source_kind` | TEXT | NOT NULL, DEFAULT 'local' | 'local' \| 'hosted' |
| `cloud_workspace_id` | TEXT | | |
| `hosted_invite_id` | TEXT | | |
| `can_approve_budget` | INTEGER | BOOLEAN, DEFAULT FALSE | |
| `can_approve_authority` | INTEGER | BOOLEAN, DEFAULT FALSE | |
| `can_manage_routines` | INTEGER | BOOLEAN, DEFAULT FALSE | |
| `can_manage_runtimes` | INTEGER | BOOLEAN, DEFAULT FALSE | |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

### `employees`

AI agent instances (role pack instantiations).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `role_pack_id` | TEXT | NOT NULL | Pack identifier (e.g., "strategia-official") |
| `role_id` | TEXT | NOT NULL | Role within pack (e.g., "ceo") |
| `role_md_sha` | TEXT | NOT NULL | SHA256 of rendered role.md |
| `level` | TEXT | NOT NULL | 'Officer' \| 'Senior Management' \| 'Management' \| 'Supervisor' \| 'Lead' \| 'IC' |
| `name` | TEXT | NOT NULL | Agent display name |
| `title` | TEXT | NOT NULL | Job title |
| `status` | TEXT | NOT NULL, DEFAULT 'idle' | 'idle' \| 'thinking' \| 'streaming' \| 'blocked' \| 'meeting' \| 'offline' |
| `model_pref` | TEXT | | Optional model override |
| `provider_pref` | TEXT | | Optional provider override |
| `tools_allowed_json` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of tool names |
| `tools_denied_json` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of tool names |
| `avatar` | TEXT | | Avatar identifier |
| `is_system` | INTEGER | BOOLEAN, DEFAULT FALSE | Framework-internal flag |
| `created_at` | INTEGER | NOT NULL | UNIX ms |

### `threads`

Conversations (DM, group, meeting, ticket, broadcast).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `kind` | TEXT | NOT NULL | 'dm' \| 'group' \| 'meeting' \| 'ticket' \| 'broadcast' |
| `subject` | TEXT | | Thread subject (optional) |
| `created_by` | TEXT | NOT NULL | Member id (user or employee) |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `last_message_at` | INTEGER | | Updated on every message (sort key) |
| `ticket_id` | TEXT | FK → tickets.id | Nullable FK for ticket threads |

### `thread_members`

Thread membership edges.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `thread_id` | TEXT | FK → threads.id, NOT NULL | |
| `member_id` | TEXT | NOT NULL | User or employee id |
| `member_kind` | TEXT | NOT NULL | 'user' \| 'employee' |
| `role_in_thread` | TEXT | | Optional role (e.g., "facilitator") |

**Composite PK:** `(thread_id, member_id, member_kind)`

### `messages`

Chat + tool-call log.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `thread_id` | TEXT | FK → threads.id, NOT NULL | |
| `author_id` | TEXT | NOT NULL | User or employee id |
| `author_kind` | TEXT | NOT NULL | 'user' \| 'employee' \| 'system' |
| `content` | TEXT | NOT NULL | Message text |
| `tool_calls_json` | TEXT | | Serialized tool call array |
| `parent_id` | TEXT | | Parent message for threading |
| `is_agent_initiated` | INTEGER | BOOLEAN, DEFAULT FALSE | True when agent → agent |
| `created_at` | INTEGER | NOT NULL | UNIX ms |

### `events`

Append-only event log (source of truth for dashboard).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | NOT NULL | No FK (retain after company delete) |
| `actor_id` | TEXT | NOT NULL | User, employee, system, orchestrator, provider |
| `actor_kind` | TEXT | NOT NULL | 'user' \| 'employee' \| 'system' \| 'orchestrator' \| 'provider' |
| `event_type` | TEXT | NOT NULL | Event type (e.g., "work.started") |
| `payload_json` | TEXT | NOT NULL | Event payload |
| `created_at` | INTEGER | NOT NULL | UNIX ms |

**Architectural invariant #6:** Event log is append-only; never delete or update.

### `runs`

LLM call records (telemetry).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `employee_id` | TEXT | NOT NULL | |
| `thread_id` | TEXT | | |
| `provider` | TEXT | NOT NULL | 'anthropic' \| 'openai' \| 'ollama', etc. |
| `model` | TEXT | NOT NULL | Model name (e.g., "claude-opus-4") |
| `prompt_tokens` | INTEGER | NOT NULL, DEFAULT 0 | |
| `completion_tokens` | INTEGER | NOT NULL, DEFAULT 0 | |
| `latency_ms` | INTEGER | NOT NULL, DEFAULT 0 | |
| `cost_usd` | TEXT | NOT NULL, DEFAULT '0' | Decimal string (sub-cent precision) |
| `tool_calls_count` | INTEGER | NOT NULL, DEFAULT 0 | |
| `started_at` | INTEGER | NOT NULL | UNIX ms |
| `ended_at` | INTEGER | | UNIX ms |
| `status` | TEXT | NOT NULL, DEFAULT 'running' | 'running' \| 'success' \| 'error' \| 'cancelled' |
| `error` | TEXT | | Error message if failed |
| `kind` | TEXT | NOT NULL, DEFAULT 'work' | 'work' \| 'agentic' \| 'copilot' |

**Run Kind Discriminator:** Distinguishes Phase 1 chat (`work`), M31 agentic loop (`agentic`), and M33 copilot analyzer (`copilot`).

### `providers`

Installed LLM providers (API keys in OS keychain).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `name` | TEXT | NOT NULL | Display name |
| `kind` | TEXT | NOT NULL | 'anthropic' \| 'openai' \| 'google' \| 'openrouter' \| 'groq' \| 'together' \| 'fireworks' \| 'ollama' \| 'openai-compatible' |
| `config_json` | TEXT | NOT NULL, DEFAULT '{}' | Non-secret config (base URL, org id) |
| `privacy_tier` | TEXT | NOT NULL | 'local' \| 'open-source-cloud' \| 'proprietary-cloud' |
| `enabled` | INTEGER | BOOLEAN, DEFAULT TRUE | |

### `settings`

Key/value store (global or scoped).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `key` | TEXT | PK | Setting key |
| `value_json` | TEXT | NOT NULL | Setting value (JSON) |
| `scope` | TEXT | NOT NULL, DEFAULT 'global' | 'global' \| 'company' \| 'employee' |
| `scope_id` | TEXT | | Company or employee id |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

## Work Management

### `tickets`

Primary work primitive.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `title` | TEXT | NOT NULL | |
| `description` | TEXT | NOT NULL, DEFAULT '' | |
| `status` | TEXT | NOT NULL, DEFAULT 'open' | 'open' \| 'in-progress' \| 'blocked' \| 'done' |
| `priority` | TEXT | NOT NULL, DEFAULT 'medium' | 'low' \| 'medium' \| 'high' \| 'critical' |
| `assignee_id` | TEXT | FK → employees.id | Null = unassigned |
| `reporter_id` | TEXT | NOT NULL | User or employee who filed |
| `reporter_kind` | TEXT | NOT NULL, DEFAULT 'user' | 'user' \| 'employee' \| 'system' |
| `labels_json` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of tags |
| `dependencies_json` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of blocking ticket ids |
| `sla_hours` | INTEGER | | Target hours to resolution |
| `due_at` | INTEGER | | UNIX ms deadline |
| `thread_id` | TEXT | FK → threads.id | Discussion thread |
| `goal_id` | TEXT | FK → goals.id | Optional goal ancestry |
| `parent_ticket_id` | TEXT | FK → tickets.id | Parent for task hierarchies |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |
| `closed_at` | INTEGER | | UNIX ms |

**Indexes:**
- `idx_tickets_goal` on `goal_id`
- `idx_tickets_parent` on `parent_ticket_id`

### `goals`

Company-level objectives.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `title` | TEXT | NOT NULL | |
| `description` | TEXT | NOT NULL, DEFAULT '' | |
| `status` | TEXT | NOT NULL, DEFAULT 'active' | 'active' \| 'achieved' \| 'abandoned' |
| `progress_pct` | INTEGER | NOT NULL, DEFAULT 0 | 0-100 (calculated from projects) |
| `target_date` | INTEGER | | UNIX ms deadline |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

### `projects`

Sit between goals and tickets.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `goal_id` | TEXT | FK → goals.id | Null = standalone project |
| `title` | TEXT | NOT NULL | |
| `description` | TEXT | NOT NULL, DEFAULT '' | |
| `status` | TEXT | NOT NULL, DEFAULT 'planning' | 'planning' \| 'active' \| 'completed' \| 'archived' |
| `lead_id` | TEXT | FK → employees.id | Project lead |
| `priority` | TEXT | NOT NULL, DEFAULT 'medium' | 'low' \| 'medium' \| 'high' \| 'critical' |
| `target_date` | INTEGER | | UNIX ms deadline |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

### `project_tickets`

M:N junction linking projects to tickets.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `project_id` | TEXT | FK → projects.id, NOT NULL | |
| `ticket_id` | TEXT | FK → tickets.id, NOT NULL | |

**Composite PK:** `(project_id, ticket_id)`

### `meetings`

Facilitated multi-agent conversations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `thread_id` | TEXT | FK → threads.id, NOT NULL | Meeting thread |
| `chair_id` | TEXT | FK → employees.id, NOT NULL | Meeting facilitator |
| `agenda` | TEXT | NOT NULL, DEFAULT '' | Meeting agenda |
| `mode` | TEXT | NOT NULL, DEFAULT 'round-robin' | 'round-robin' \| 'chair-directed' \| 'freeform' |
| `status` | TEXT | NOT NULL, DEFAULT 'active' | 'active' \| 'ended' |
| `minutes_md` | TEXT | | Markdown summary (populated on end) |
| `attendees_json` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of employee ids |
| `action_items_json` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of action items |
| `started_at` | INTEGER | NOT NULL | UNIX ms |
| `ended_at` | INTEGER | | UNIX ms |

## AI & Intelligence

### `embeddings`

RAG vector embeddings.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `source_type` | TEXT | NOT NULL | 'message' \| 'ticket' \| 'vault_file' \| 'meeting_minutes' \| 'goal' \| 'project' |
| `source_id` | TEXT | NOT NULL | FK to source row |
| `chunk_index` | INTEGER | NOT NULL, DEFAULT 0 | For multi-chunk content |
| `content_text` | TEXT | NOT NULL | Text that was embedded |
| `embedding` | BLOB | NOT NULL | Float32Array (vector) |
| `created_at` | INTEGER | NOT NULL | UNIX ms |

**Companion table:** `vec_embeddings` (sqlite-vec virtual table) for vector similarity search.

### `copilot_insights`

Periodic-analyzer output (M33).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `category` | TEXT | NOT NULL | 'operational' \| 'cost' \| 'org' \| 'workflow' \| 'anomaly' (CHECK) |
| `severity` | TEXT | NOT NULL | 'critical' \| 'warning' \| 'info' (CHECK) |
| `title` | TEXT | NOT NULL | Insight headline |
| `detail` | TEXT | NOT NULL | Markdown body |
| `action_suggestion` | TEXT | | Optional suggested action |
| `action_intent` | TEXT | | Optional NLU intent name |
| `action_entities_json` | TEXT | | Optional intent entity map |
| `dismissed_at` | INTEGER | | Stamped on user dismissal (NULL = active) |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `expires_at` | INTEGER | NOT NULL | Hard expiry (deleted by `expireStale`) |

**Indexes:**
- `idx_insights_company_active` on `(company_id, dismissed_at, expires_at)` — hot path for `listActive`

**Deduplication:** Jaccard bigram similarity > 0.8 within `(company_id, category)` bucket, with numeric drift guard.

### `command_history`

Command palette (Cmd+K) history.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `actor_id` | TEXT | NOT NULL | 'user' or employee id |
| `text` | TEXT | NOT NULL | Raw user input |
| `intent` | TEXT | NOT NULL | Classified intent name |
| `entities_json` | TEXT | NOT NULL | Dispatched entities (JSON) |
| `executed_at` | TEXT | NOT NULL | ISO-8601 timestamp (UTC) |
| `outcome` | TEXT | NOT NULL | 'ok' \| 'error' |
| `result_id` | TEXT | | Stringified result id |

**Retention:** FIFO eviction at 20 rows per company.

## Extensions & Authority

### `extensions`

Installed skills and MCP servers.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id | Null = global extension |
| `kind` | TEXT | NOT NULL | 'skill' \| 'mcp' |
| `name` | TEXT | NOT NULL | Extension name |
| `slug` | TEXT | NOT NULL | URL-safe identifier |
| `source_kind` | TEXT | NOT NULL | 'local' \| 'github' \| 'marketplace' \| 'template' |
| `source_ref` | TEXT | NOT NULL | Path or URL |
| `version` | TEXT | | |
| `update_channel` | TEXT | | |
| `manifest_json` | TEXT | | Extension manifest |
| `requested_capabilities_json` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of capabilities |
| `requested_paths_json` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of paths |
| `enabled` | INTEGER | BOOLEAN, DEFAULT TRUE | |
| `trust_state` | TEXT | NOT NULL, DEFAULT 'pending-review' | 'trusted' \| 'pending-review' \| 'denied' |
| `runtime_ref_id` | TEXT | | Optional MCP server bridge ref |
| `installed_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

### `skill_assignments`

Workspace-level or employee-level skill enablement.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `extension_id` | TEXT | FK → extensions.id, NOT NULL | |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `employee_id` | TEXT | FK → employees.id | Null = workspace-default |
| `enabled` | INTEGER | BOOLEAN, NOT NULL, DEFAULT TRUE | |
| `source` | TEXT | NOT NULL | 'workspace-default' \| 'employee-override' |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

### `authority_grants`

Unified authority matrix (capability + path grants).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `scope_kind` | TEXT | NOT NULL | 'company' \| 'employee' \| 'extension' |
| `scope_id` | TEXT | NOT NULL | |
| `resource_kind` | TEXT | NOT NULL | 'capability' \| 'path' |
| `resource_id` | TEXT | NOT NULL | |
| `permission` | TEXT | NOT NULL | 'allow' \| 'deny' \| 'prompt' |
| `metadata_json` | TEXT | | |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

### `authority_requests`

Requested-but-not-yet-approved authority expansions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `extension_id` | TEXT | FK → extensions.id, NOT NULL | |
| `employee_id` | TEXT | FK → employees.id | |
| `resource_kind` | TEXT | NOT NULL | 'capability' \| 'path' |
| `resource_id` | TEXT | NOT NULL | |
| `requested_permission` | TEXT | NOT NULL | 'allow' \| 'deny' \| 'prompt' |
| `status` | TEXT | NOT NULL, DEFAULT 'pending' | 'pending' \| 'approved' \| 'denied' |
| `reason` | TEXT | | |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `reviewed_at` | INTEGER | | UNIX ms |

### `mcp_servers`

MCP server configurations (global or per-company).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | | Null = global server |
| `name` | TEXT | NOT NULL | Display name |
| `transport` | TEXT | NOT NULL | 'stdio' \| 'sse' |
| `config_json` | TEXT | NOT NULL, DEFAULT '{}' | Command + args (stdio) or URL (SSE) |
| `enabled` | INTEGER | BOOLEAN, NOT NULL, DEFAULT TRUE | |
| `last_health` | TEXT | | |
| `installed_at` | INTEGER | NOT NULL | UNIX ms |

### `tool_calls`

Tool invocation audit log.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `run_id` | TEXT | NOT NULL | |
| `tool_name` | TEXT | NOT NULL | |
| `mcp_server_id` | TEXT | | |
| `input_json` | TEXT | NOT NULL | Truncated to 8KB |
| `output_json` | TEXT | | Truncated to 8KB |
| `latency_ms` | INTEGER | NOT NULL, DEFAULT 0 | |
| `status` | TEXT | NOT NULL, DEFAULT 'success' | 'success' \| 'error' \| 'denied' |
| `error` | TEXT | | |
| `created_at` | INTEGER | NOT NULL | UNIX ms |

## Governance & Budgets

### `budget_policies`

Spend and escalation policies.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `scope_kind` | TEXT | NOT NULL | 'company' \| 'employee' \| 'runtime-profile' \| 'routine' |
| `scope_ref_id` | TEXT | NOT NULL | |
| `period` | TEXT | NOT NULL, DEFAULT 'monthly' | 'monthly' |
| `hard_cap_usd` | TEXT | NOT NULL | Decimal string (max spend) |
| `warning_threshold_pct` | INTEGER | NOT NULL, DEFAULT 80 | Warn at % of cap |
| `auto_pause` | INTEGER | BOOLEAN, NOT NULL, DEFAULT FALSE | Pause company when exceeded |
| `require_approval_above_usd` | TEXT | | Require approval for single spend above |
| `enabled` | INTEGER | BOOLEAN, NOT NULL, DEFAULT TRUE | |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

**Unique:** `(company_id, scope_kind, scope_ref_id, period)` — one policy per scope per period.

### `budget_ledger_entries`

Ledgered spend snapshots.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `budget_policy_id` | TEXT | FK → budget_policies.id | |
| `scope_kind` | TEXT | NOT NULL | 'company' \| 'employee' \| 'runtime-profile' \| 'routine' |
| `scope_ref_id` | TEXT | NOT NULL | |
| `run_id` | TEXT | FK → runs.id, NOT NULL | |
| `run_kind` | TEXT | NOT NULL | 'work' \| 'agentic' \| 'copilot' |
| `thread_id` | TEXT | | |
| `employee_id` | TEXT | NOT NULL | |
| `runtime_profile_id` | TEXT | | |
| `routine_id` | TEXT | | |
| `provider` | TEXT | NOT NULL | |
| `model` | TEXT | NOT NULL | |
| `amount_usd` | TEXT | NOT NULL | Decimal string (spend) |
| `occurred_at` | INTEGER | NOT NULL | UNIX ms |
| `created_at` | INTEGER | NOT NULL | UNIX ms |

**Unique:** `(scope_kind, scope_ref_id, run_id)` — one ledger entry per run per scope.

### `approval_items`

Pending and resolved approval work items.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `kind` | TEXT | NOT NULL | 'authority-request' \| 'planner-request' \| 'runtime-request' \| 'routine-request' \| 'budget-exception' \| 'deliverable-review' \| 'artifact-publish' |
| `status` | TEXT | NOT NULL, DEFAULT 'pending' | 'pending' \| 'approved' \| 'denied' \| 'dismissed' |
| `priority` | TEXT | NOT NULL, DEFAULT 'medium' | 'low' \| 'medium' \| 'high' \| 'critical' |
| `requested_by_operator_id` | TEXT | | |
| `requested_by_employee_id` | TEXT | | |
| `subject_ref_kind` | TEXT | NOT NULL | 'budget-policy' \| 'extension' \| 'planner' \| 'company' \| 'employee' \| 'runtime-profile' \| 'routine' \| 'deliverable' \| 'artifact' |
| `subject_ref_id` | TEXT | NOT NULL | |
| `summary` | TEXT | NOT NULL | |
| `payload_json` | TEXT | NOT NULL, DEFAULT '{}' | |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `resolved_at` | INTEGER | | UNIX ms |

### `approval_decisions`

Audit trail of approval decisions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `approval_kind` | TEXT | NOT NULL | Matches `approval_items.kind` or unified kinds |
| `approval_ref_id` | TEXT | NOT NULL | `approval_items.id` or source-system request id |
| `decision` | TEXT | NOT NULL | 'approved' \| 'denied' \| 'dismissed' |
| `decided_by_operator_id` | TEXT | | |
| `rationale` | TEXT | | |
| `payload_json` | TEXT | NOT NULL, DEFAULT '{}' | |
| `created_at` | INTEGER | NOT NULL | UNIX ms |

### `artifacts`

First-class work products and execution outcomes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `kind` | TEXT | NOT NULL | 'ticket-output' \| 'approval-record' \| 'vault-file' |
| `outcome_kind` | TEXT | NOT NULL, DEFAULT 'artifact-created' | 'artifact-created' \| 'approval-complete' \| 'report-generated' \| 'publish-pending' \| 'publish-complete' |
| `status` | TEXT | NOT NULL, DEFAULT 'ready' | 'ready' \| 'pending' |
| `title` | TEXT | NOT NULL | |
| `summary` | TEXT | | |
| `source_kind` | TEXT | NOT NULL | 'routine-run' \| 'approval-decision' \| 'vault-file' |
| `source_ref_id` | TEXT | NOT NULL | |
| `ticket_id` | TEXT | FK → tickets.id | |
| `file_id` | TEXT | FK → file_vault.id | |
| `approval_item_id` | TEXT | FK → approval_items.id | |
| `approval_decision_id` | TEXT | FK → approval_decisions.id | |
| `uri` | TEXT | | Optional external URI |
| `preview_json` | TEXT | NOT NULL, DEFAULT '{}' | Preview metadata |
| `created_by_employee_id` | TEXT | FK → employees.id | |
| `created_by_routine_id` | TEXT | FK → routines.id | |
| `approved_by_operator_id` | TEXT | FK → operators.id | |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

**Unique:** `(company_id, kind, source_kind, source_ref_id)` — one artifact per source.

## Runtime & Proactive

### `runtime_profiles`

Named runtime posture profiles.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `name` | TEXT | NOT NULL | Profile display name |
| `slug` | TEXT | NOT NULL | URL-safe identifier |
| `kind` | TEXT | NOT NULL | 'teamx-internal' \| 'bash' \| 'http' \| 'codex' \| 'claude-code' \| 'cursor' |
| `enabled` | INTEGER | BOOLEAN, NOT NULL, DEFAULT TRUE | |
| `config_json` | TEXT | NOT NULL, DEFAULT '{}' | Runtime configuration |
| `last_health_status` | TEXT | NOT NULL, DEFAULT 'unknown' | 'unknown' \| 'healthy' \| 'warning' \| 'error' |
| `last_health_message` | TEXT | | |
| `last_validated_at` | INTEGER | | UNIX ms |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

**Unique:** `(company_id, slug)` — one profile per slug per company.

### `employee_runtime_bindings`

Employee → runtime profile bindings.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `employee_id` | TEXT | FK → employees.id, NOT NULL | |
| `runtime_profile_id` | TEXT | FK → runtime_profiles.id, NOT NULL | |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

**Unique:** `employee_id` — one binding per employee.

### `runtime_sessions`

Durable external runtime session state.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `employee_id` | TEXT | FK → employees.id, NOT NULL | |
| `runtime_profile_id` | TEXT | FK → runtime_profiles.id | |
| `adapter_kind` | TEXT | NOT NULL | 'bash' \| 'http' \| 'codex' \| 'claude-code' \| 'cursor' |
| `status` | TEXT | NOT NULL, DEFAULT 'starting' | 'starting' \| 'idle' \| 'working' \| 'blocked' \| 'stale' \| 'offline' \| 'failed' \| 'ended' |
| `current_run_id` | TEXT | FK → runs.id | |
| `current_ticket_id` | TEXT | FK → tickets.id | |
| `pid` | INTEGER | | Process ID |
| `endpoint_url` | TEXT | | HTTP endpoint URL |
| `workspace_path` | TEXT | | Local workspace directory |
| `capabilities_json` | TEXT | NOT NULL, DEFAULT '{}' | |
| `last_heartbeat_at` | INTEGER | | UNIX ms |
| `lease_expires_at` | INTEGER | | UNIX ms |
| `failure_reason` | TEXT | | |
| `started_at` | INTEGER | NOT NULL | UNIX ms |
| `ended_at` | INTEGER | | UNIX ms |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

### `runtime_heartbeats`

Append-only heartbeat history.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `session_id` | TEXT | FK → runtime_sessions.id, NOT NULL | |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `employee_id` | TEXT | FK → employees.id, NOT NULL | |
| `runtime_profile_id` | TEXT | FK → runtime_profiles.id | |
| `status` | TEXT | NOT NULL | Mirrors runtime_sessions.status |
| `current_run_id` | TEXT | FK → runs.id | |
| `current_ticket_id` | TEXT | FK → tickets.id | |
| `cost_delta_json` | TEXT | NOT NULL, DEFAULT '{}' | Cost since last heartbeat |
| `message` | TEXT | | Optional message |
| `created_at` | INTEGER | NOT NULL | UNIX ms |

### `routines`

Recurring operating loops.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `name` | TEXT | NOT NULL | |
| `slug` | TEXT | NOT NULL | URL-safe identifier |
| `enabled` | INTEGER | BOOLEAN, NOT NULL, DEFAULT TRUE | |
| `trigger_kind` | TEXT | NOT NULL | 'interval' \| 'daily' \| 'weekly' |
| `schedule_json` | TEXT | NOT NULL, DEFAULT '{}' | Cron expression or interval |
| `work_kind` | TEXT | NOT NULL, DEFAULT 'ticket' | 'ticket' |
| `work_config_json` | TEXT | NOT NULL, DEFAULT '{}' | Work template |
| `last_run_status` | TEXT | NOT NULL, DEFAULT 'never' | 'never' \| 'running' \| 'success' \| 'error' |
| `last_run_message` | TEXT | | |
| `last_run_at` | INTEGER | | UNIX ms |
| `next_run_at` | INTEGER | | UNIX ms |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

**Unique:** `(company_id, slug)` — one routine per slug per company.

### `routine_runs`

Historical materializations of routines.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `routine_id` | TEXT | FK → routines.id, NOT NULL | |
| `status` | TEXT | NOT NULL | 'running' \| 'success' \| 'error' |
| `reason` | TEXT | NOT NULL | 'scheduled' \| 'manual' |
| `work_kind` | TEXT | NOT NULL, DEFAULT 'ticket' | 'ticket' |
| `scheduled_for` | INTEGER | | UNIX ms |
| `started_at` | INTEGER | NOT NULL | UNIX ms |
| `finished_at` | INTEGER | | UNIX ms |
| `ticket_id` | TEXT | FK → tickets.id | Resulting ticket (if work_kind='ticket') |
| `message` | TEXT | | Output message |
| `error_message` | TEXT | | Error if failed |

### `agent_wakeup_requests`

Proactive execution queue.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `agent_id` | TEXT | FK → employees.id, NOT NULL | |
| `status` | TEXT | NOT NULL, DEFAULT 'pending' | 'pending' \| 'processing' \| 'completed' \| 'failed' \| 'cancelled' |
| `trigger_type` | TEXT | NOT NULL | 'routine' \| 'ticket_assigned' \| 'schedule' \| 'manual' \| 'goal_decomposed' |
| `trigger_id` | TEXT | | Reference to routineId, ticketId, goalId, etc. |
| `priority` | INTEGER | NOT NULL, DEFAULT 50 | 0-100, higher = sooner |
| `scheduled_for` | INTEGER | NOT NULL | UNIX ms (when to execute) |
| `started_at` | INTEGER | | UNIX ms |
| `completed_at` | INTEGER | | UNIX ms |
| `attempt_count` | INTEGER | NOT NULL, DEFAULT 0 | Retry attempts |
| `max_attempts` | INTEGER | NOT NULL, DEFAULT 4 | Max retries |
| `next_retry_at` | INTEGER | | UNIX ms (when to retry after failure) |
| `context_json` | TEXT | NOT NULL, DEFAULT '{}' | Goal ancestry, execution context |
| `result_json` | TEXT | | Execution results |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

**Indexes:**
- `idx_agent_wakeup_requests_company_status` on `(company_id, status)`
- `idx_agent_wakeup_requests_agent_scheduled` on `(agent_id, scheduled_for)`
- `idx_agent_wakeup_requests_priority_scheduled` on `(priority, scheduled_for)`

### `schedule_items`

User-scheduled work and reminders.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `title` | TEXT | NOT NULL | |
| `description` | TEXT | NOT NULL, DEFAULT '' | |
| `kind` | TEXT | NOT NULL, DEFAULT 'task' | 'task' \| 'deadline' \| 'milestone' \| 'reminder' |
| `status` | TEXT | NOT NULL, DEFAULT 'scheduled' | 'scheduled' \| 'completed' \| 'cancelled' |
| `priority` | TEXT | NOT NULL, DEFAULT 'medium' | 'low' \| 'medium' \| 'high' \| 'critical' |
| `starts_at` | INTEGER | NOT NULL | UNIX ms |
| `ends_at` | INTEGER | | UNIX ms |
| `reminder_at` | INTEGER | | UNIX ms |
| `ticket_id` | TEXT | FK → tickets.id | Optional linked ticket |
| `project_id` | TEXT | FK → projects.id | Optional linked project |
| `goal_id` | TEXT | FK → goals.id | Optional linked goal |
| `assignee_id` | TEXT | FK → employees.id | Optional assigned employee |
| `wakeup_request_id` | TEXT | FK → agent_wakeup_requests.id | Optional proactive wakeup |
| `source_kind` | TEXT | NOT NULL, DEFAULT 'manual' | 'manual' \| 'ticket_due' \| 'project_due' \| 'goal_due' |
| `source_id` | TEXT | | Source record id |
| `created_by_id` | TEXT | NOT NULL | User or employee id |
| `created_by_kind` | TEXT | NOT NULL, DEFAULT 'user' | 'user' \| 'employee' \| 'system' |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |
| `completed_at` | INTEGER | | UNIX ms |

## Org Chart

### `org_edges`

Manager → report reporting relationships.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | CASCADE on delete |
| `manager_id` | TEXT | FK → employees.id, NOT NULL | CASCADE on delete |
| `report_id` | TEXT | FK → employees.id, NOT NULL, UNIQUE | CASCADE on delete |
| `created_at` | INTEGER | NOT NULL | UNIX ms |

**Unique:** `report_id` — single manager per report (no diamond inheritance).  
**Indexes:** `idx_org_edges_company_manager` on `(company_id, manager_id)` — accelerates tree projection.

## File Vault

### `file_vault`

File metadata (files stored on disk).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | |
| `filename` | TEXT | NOT NULL | Sanitized filename on disk |
| `original_name` | TEXT | NOT NULL | User-visible filename |
| `mime_type` | TEXT | NOT NULL, DEFAULT 'application/octet-stream' | |
| `size_bytes` | INTEGER | NOT NULL, DEFAULT 0 | |
| `sha256` | TEXT | NOT NULL | Hex-encoded digest (verified on read) |
| `vault_path` | TEXT | NOT NULL | Relative path under company vault dir |
| `extracted_text` | TEXT | | Text content for FTS5 indexing |
| `tags_json` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of user tags |
| `uploaded_by` | TEXT | NOT NULL | User or employee id |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

**Companion table:** `file_vault_fts` (FTS5 virtual table) for full-text search.

### `ticket_attachments`

Links vault files to tickets.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `ticket_id` | TEXT | FK → tickets.id, NOT NULL | |
| `file_id` | TEXT | FK → file_vault.id, NOT NULL | |
| `attached_by` | TEXT | NOT NULL | User or employee id |
| `attached_at` | INTEGER | NOT NULL | UNIX ms |

## Memory & Context

### `thread_digests`

Durable rolling digests for threads.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | CASCADE |
| `thread_id` | TEXT | FK → threads.id, NOT NULL, UNIQUE | CASCADE |
| `summary` | TEXT | NOT NULL | Thread summary |
| `pinned_facts_json` | TEXT | NOT NULL, DEFAULT '[]' | Important facts |
| `last_summarized_message_id` | TEXT | FK → messages.id | Last message included |
| `estimated_tokens` | INTEGER | NOT NULL, DEFAULT 0 | Token count estimate |
| `freshness` | TEXT | NOT NULL, DEFAULT 'stale' | 'fresh' \| 'stale' \| 'degraded' |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

### `run_checkpoints`

Resumable run boundaries for stop/timeout/approval flows.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | CASCADE |
| `thread_id` | TEXT | FK → threads.id, NOT NULL | CASCADE |
| `run_id` | TEXT | FK → runs.id | |
| `employee_id` | TEXT | FK → employees.id | |
| `checkpoint_kind` | TEXT | NOT NULL | 'manual' \| 'completion' \| 'stopped' \| 'timeout' \| 'approval-blocked' \| 'budget-blocked' \| 'routine-completed' |
| `objective` | TEXT | | |
| `progress_summary` | TEXT | NOT NULL | |
| `blockers_json` | TEXT | NOT NULL, DEFAULT '[]' | |
| `next_action` | TEXT | | |
| `active_artifact_refs_json` | TEXT | NOT NULL, DEFAULT '[]' | |
| `unresolved_approval_refs_json` | TEXT | NOT NULL, DEFAULT '[]' | |
| `resume_origin_json` | TEXT | | |
| `created_at` | INTEGER | NOT NULL | UNIX ms |

### `ticket_checkouts`

Run-owned ticket leases (prevent duplicate work).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Nanoid |
| `company_id` | TEXT | FK → companies.id, NOT NULL | CASCADE |
| `ticket_id` | TEXT | FK → tickets.id, NOT NULL | CASCADE |
| `employee_id` | TEXT | FK → employees.id, NOT NULL | CASCADE |
| `runtime_session_id` | TEXT | FK → runtime_sessions.id | |
| `run_id` | TEXT | FK → runs.id | |
| `status` | TEXT | NOT NULL, DEFAULT 'active' | 'active' \| 'released' \| 'expired' \| 'completed' \| 'blocked' |
| `claimed_at` | INTEGER | NOT NULL | UNIX ms |
| `last_heartbeat_at` | INTEGER | | UNIX ms |
| `expires_at` | INTEGER | NOT NULL | UNIX ms |
| `released_at` | INTEGER | | UNIX ms |
| `release_reason` | TEXT | | |
| `created_at` | INTEGER | NOT NULL | UNIX ms |
| `updated_at` | INTEGER | NOT NULL | UNIX ms |

**Unique (conditional):** `ticket_id` where `status = 'active'` — one active checkout per ticket.

## Database Initialization

### Boot Sequence

1. **Open database** at `{userData}/team-x.sqlite`
2. **Run migrations** from `migrations/` folder
3. **Enable WAL mode** for concurrent access
4. **Enable FTS5** for vault full-text search
5. **Seed** default providers, system agents (if first boot)

### Migration Files

- `0000_initial.sql` — Core tables (Phase 1)
- `0001_*.sql` through `0013_*.sql` — Phase 2-6 additions
- Each migration is atomic and reversible (in theory)

---

*This documentation is auto-generated by the project-docs skill. Last updated: 2026-05-03*
