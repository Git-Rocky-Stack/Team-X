/**
 * Team-X SQLite schema (Phase 1 + Phase 2 + Phase 3 + Phase 4).
 *
 * Phase 1 tables: companies, employees, threads, threadMembers, messages,
 * events, runs, providers, settings.
 * Phase 2 additions: mcpServers, toolCalls (M10), tickets (M12),
 * threads.ticketId FK (M12).
 * Phase 3 additions: goals, projects, projectTickets (M15),
 * meetings + companies.status (M16).
 * Phase 4 additions: fileVault (M21).
 *
 * Design notes:
 * - Primary keys are text-typed to hold nanoid values (see packages/shared-types).
 * - Timestamps are integer UNIX ms (SQLite has no native datetime; ms ints sort
 *   lexicographically, are language-neutral, and round-trip through JSON cleanly).
 * - Money is stored as a decimal string (`cost_usd`) to avoid float drift on
 *   fractional-cent values. Parse with `Number()` or a bigdecimal library at
 *   the edge, never inside aggregate SQL.
 * - JSON blobs are stored as text with a `_json` suffix. Callers are
 *   responsible for JSON.parse/stringify. Drizzle's `.$type<T>()` helper will
 *   be wired up in Task 20+ alongside the typed query helpers.
 * - Foreign keys are declared but will only be enforced once the DB init
 *   helper runs `PRAGMA foreign_keys = ON` (landing in Task 20).
 */

import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** One row per AI company the user has created (multi-company is Phase 2+). */
export const companies = sqliteTable('companies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: integer('created_at').notNull(),
  /** Serialized company-scoped settings (mission, values, etc.). */
  settingsJson: text('settings_json').notNull().default('{}'),
  /** Optional emoji or short icon identifier rendered in the company switcher. */
  icon: text('icon'),
  theme: text('theme').notNull().default('dark'),
  /** running | meeting | paused. Controls orchestrator dispatch for this company. */
  status: text('status').notNull().default('running'),
});

/** Each employee is an instantiated role from a role pack (see role-packs/). */
export const employees = sqliteTable('employees', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  /** Pack identifier e.g. "strategia-official". */
  rolePackId: text('role_pack_id').notNull(),
  /** Role identifier within the pack, e.g. "ceo" or "senior-fullstack-engineer". */
  roleId: text('role_id').notNull(),
  /** SHA256 of the rendered role.md — pinned for reproducibility across pack upgrades. */
  roleMdSha: text('role_md_sha').notNull(),
  /** Officer | Senior Management | Management | Supervisor | Lead | IC. */
  level: text('level').notNull(),
  name: text('name').notNull(),
  title: text('title').notNull(),
  /** idle | thinking | streaming | blocked | meeting | offline. */
  status: text('status').notNull().default('idle'),
  /** Optional model override (otherwise the role's preferred_model_tier wins). */
  modelPref: text('model_pref'),
  /** Optional provider override. */
  providerPref: text('provider_pref'),
  toolsAllowedJson: text('tools_allowed_json').notNull().default('[]'),
  toolsDeniedJson: text('tools_denied_json').notNull().default('[]'),
  avatar: text('avatar'),
  /**
   * Framework-internal pseudo-employee flag. System employees (e.g., the
   * agentic-loop `system-agent`) are never shown in the employee list,
   * hire dialog, org chart, or delegation pickers. One system-agent
   * per company is seeded idempotently via `ensureSystemAgent` at boot
   * and on `companies.create`. Stored as INTEGER 0/1 for SQLite idiom.
   */
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

/** Conversations — direct 1:1, group, meeting, ticket discussion, or broadcast. */
export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  /** dm | group | meeting | ticket | broadcast. */
  kind: text('kind').notNull(),
  subject: text('subject'),
  /** Member id of whoever created the thread (user id or employee id). */
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
  /** Updated on every message append — drives thread-list sort order. */
  lastMessageAt: integer('last_message_at'),
  /** Nullable FK to the ticket this thread discusses (kind='ticket' threads only). */
  ticketId: text('ticket_id'),
});

/** Membership edge: which users / employees belong to each thread. */
export const threadMembers = sqliteTable('thread_members', {
  threadId: text('thread_id')
    .notNull()
    .references(() => threads.id),
  memberId: text('member_id').notNull(),
  /** user | employee — distinguishes the shape of memberId. */
  memberKind: text('member_kind').notNull(),
  /** Optional role inside this thread (e.g. "facilitator" in a meeting). */
  roleInThread: text('role_in_thread'),
});

/** Chat + tool-call log. One row per message; tool calls nest via toolCallsJson. */
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => threads.id),
  authorId: text('author_id').notNull(),
  /** user | employee | system. */
  authorKind: text('author_kind').notNull(),
  content: text('content').notNull(),
  /** Serialized tool call array (name, args, result) when the author emitted tools. */
  toolCallsJson: text('tool_calls_json'),
  /** Optional parent message id for threading (e.g. replies inside a meeting). */
  parentId: text('parent_id'),
  /** True when the message was sent by an agent to another agent (M11). */
  isAgentInitiated: integer('is_agent_initiated', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
});

/**
 * Append-only event log — source of truth for the live cockpit dashboard.
 * Orchestrator writes; renderer subscribes via IPC. Invariant #6 in CLAUDE.md.
 * Deliberately not FK-constrained on company_id so we can retain history after
 * a company is soft-deleted.
 */
export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull(),
  actorId: text('actor_id').notNull(),
  /** user | employee | system | orchestrator | provider. */
  actorKind: text('actor_kind').notNull(),
  eventType: text('event_type').notNull(),
  payloadJson: text('payload_json').notNull(),
  createdAt: integer('created_at').notNull(),
});

/** One row per LLM call. Cost + tokens + latency for the Telemetry tab. */
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
  /**
   * Run discriminator — `work` (Phase 1 chat), `agentic` (M31 agentic
   * loop), `copilot` (M33 analyzer). Added by migration 0012. Defaults
   * to `work` at the SQL layer so unspecified legacy writers land in
   * the right bucket. The narrow `RunKind` union below keeps new
   * callers honest; widening it later costs a migration, not a
   * schema-wide rewrite.
   */
  kind: text('kind').notNull().default('work'),
});

/** Narrow union matching the `runs.kind` values any writer is allowed to emit. */
export type RunKind = 'work' | 'agentic' | 'copilot';

/**
 * Installed LLM providers. API keys live in the OS keychain (keytar);
 * configJson holds non-secret config only (base URL, org id, etc.).
 */
export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** anthropic | openai | google | openrouter | groq | together | fireworks | ollama | openai-compatible. */
  kind: text('kind').notNull(),
  configJson: text('config_json').notNull().default('{}'),
  /** local | open-source-cloud | proprietary-cloud. */
  privacyTier: text('privacy_tier').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
});

/** Generic key/value settings store — global or scoped to a company/employee. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  /** global | company | employee. */
  scope: text('scope').notNull().default('global'),
  scopeId: text('scope_id'),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * MCP server configurations. Global servers (company_id=null) are available
 * to all companies; per-company servers override or extend globals.
 */
export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').primaryKey(),
  /** Null = global server; otherwise scoped to this company. */
  companyId: text('company_id'),
  name: text('name').notNull(),
  /** stdio | sse */
  transport: text('transport').notNull(),
  /** Command + args for stdio, or URL for SSE. */
  configJson: text('config_json').notNull().default('{}'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastHealth: text('last_health'),
  installedAt: integer('installed_at').notNull(),
});

/**
 * Tool call audit log. Every tool invocation by an agent is recorded here.
 * Input/output are truncated to 8KB max to prevent bloat.
 */
export const toolCalls = sqliteTable('tool_calls', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  toolName: text('tool_name').notNull(),
  mcpServerId: text('mcp_server_id'),
  inputJson: text('input_json').notNull(),
  outputJson: text('output_json'),
  latencyMs: integer('latency_ms').notNull().default(0),
  /** success | error | denied */
  status: text('status').notNull().default('success'),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
});

/**
 * Tickets — the primary work primitive. Filed by users or agents,
 * assigned to employees, tracked on the kanban board.
 *
 * Each ticket optionally gets a discussion thread (kind='ticket') created
 * on first assignment. The orchestrator enqueues a WorkItem when an
 * assignee is set, and the agent can request close via structured output.
 */
export const tickets = sqliteTable('tickets', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  /** open | in-progress | blocked | done. */
  status: text('status').notNull().default('open'),
  /** low | medium | high | critical. */
  priority: text('priority').notNull().default('medium'),
  /** Assigned employee FK. Null = unassigned (sits in Open column). */
  assigneeId: text('assignee_id').references(() => employees.id),
  /** Human user or employee who filed the ticket. */
  reporterId: text('reporter_id').notNull(),
  /** user | employee | system. */
  reporterKind: text('reporter_kind').notNull().default('user'),
  /** JSON-encoded string[] of label tags. */
  labelsJson: text('labels_json').notNull().default('[]'),
  /** JSON-encoded string[] of blocking ticket ids. */
  dependenciesJson: text('dependencies_json').notNull().default('[]'),
  /** Target hours to resolution. Null = no SLA. */
  slaHours: integer('sla_hours'),
  dueAt: integer('due_at'),
  /** FK to the discussion thread (created on first assignment). */
  threadId: text('thread_id').references(() => threads.id),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  closedAt: integer('closed_at'),
});

// ---------------------------------------------------------------------------
// Phase 3 — M15: Goals & Projects
// ---------------------------------------------------------------------------

/**
 * Company-level goals. Goals decompose into projects; progress is
 * calculated as the weighted average of linked project completion.
 */
export const goals = sqliteTable('goals', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  /** active | achieved | abandoned. */
  status: text('status').notNull().default('active'),
  /** 0-100 — auto-calculated from linked project completion. */
  progressPct: integer('progress_pct').notNull().default(0),
  /** Optional deadline as UNIX ms timestamp. */
  targetDate: integer('target_date'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Projects sit between goals and tickets. A project optionally belongs
 * to a goal (goalId nullable = standalone project) and links to tickets
 * via the project_tickets junction table.
 */
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  /** Nullable FK — null means standalone project not linked to a goal. */
  goalId: text('goal_id').references(() => goals.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  /** planning | active | completed | archived. */
  status: text('status').notNull().default('planning'),
  /** Project lead — nullable FK to employees. */
  leadId: text('lead_id').references(() => employees.id),
  /** low | medium | high | critical. */
  priority: text('priority').notNull().default('medium'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * M:N junction linking projects to tickets. A ticket can belong to
 * multiple projects; a project can contain many tickets. Composite PK.
 */
export const projectTickets = sqliteTable('project_tickets', {
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  ticketId: text('ticket_id')
    .notNull()
    .references(() => tickets.id),
});

// ---------------------------------------------------------------------------
// Phase 3 — M16: Meetings
// ---------------------------------------------------------------------------

/**
 * Meeting records. Each meeting creates a thread (kind='meeting') for the
 * conversation, has a chair (the employee who facilitates), and tracks
 * attendees + status. On end, minutes_md and action_items_json are populated.
 *
 * The meeting primitive pauses the orchestrator for the company (via
 * companies.status = 'meeting'), runs turns in controlled order, then
 * resumes on end. Architectural invariant #2 makes this race-free.
 */
// ---------------------------------------------------------------------------
// Phase 4 — M21: File Vault
// ---------------------------------------------------------------------------

/**
 * Filesystem-backed file store with SHA256 integrity and FTS5 full-text
 * search. Blobs live on disk under `<userData>/companies/<slug>/vault/`;
 * only metadata lives here. Architectural invariant #4 — never store
 * file blobs in SQLite.
 *
 * The companion `file_vault_fts` FTS5 virtual table is maintained via
 * triggers in the migration SQL (content-sync triggers on insert/update/delete).
 * Drizzle doesn't model FTS5 tables, so search queries use raw SQL.
 */
export const fileVault = sqliteTable('file_vault', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  /** Sanitized filename on disk (may include SHA prefix for collision avoidance). */
  filename: text('filename').notNull(),
  /** Original name as the user uploaded it (preserved for display). */
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull().default('application/octet-stream'),
  sizeBytes: integer('size_bytes').notNull().default(0),
  /** Hex-encoded SHA256 digest of the file content. Verified on read. */
  sha256: text('sha256').notNull(),
  /** Relative path inside the company vault directory. */
  vaultPath: text('vault_path').notNull(),
  /** Extracted text content for FTS5 indexing (markdown, txt, code, etc.). */
  extractedText: text('extracted_text'),
  /** JSON-encoded string[] of user-defined tags. */
  tagsJson: text('tags_json').notNull().default('[]'),
  /** Who uploaded the file (user id or employee id). */
  uploadedBy: text('uploaded_by').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// ---------------------------------------------------------------------------
// Phase 4 — M22: Ticket Attachments
// ---------------------------------------------------------------------------

/**
 * Links vault files to tickets. A ticket can have many attachments;
 * a file can be attached to many tickets.
 */
export const ticketAttachments = sqliteTable('ticket_attachments', {
  id: text('id').primaryKey(),
  ticketId: text('ticket_id')
    .notNull()
    .references(() => tickets.id),
  fileId: text('file_id')
    .notNull()
    .references(() => fileVault.id),
  attachedBy: text('attached_by').notNull(),
  attachedAt: integer('attached_at').notNull(),
});

// ---------------------------------------------------------------------------
// Phase 3 — M16: Meetings (continued from above)
// ---------------------------------------------------------------------------

export const meetings = sqliteTable('meetings', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  /** FK to the meeting thread (kind='meeting'). */
  threadId: text('thread_id')
    .notNull()
    .references(() => threads.id),
  /** Employee who chairs the meeting — speaks first, directs turns. */
  chairId: text('chair_id')
    .notNull()
    .references(() => employees.id),
  agenda: text('agenda').notNull().default(''),
  /** round-robin | chair-directed | freeform. */
  mode: text('mode').notNull().default('round-robin'),
  /** active | ended. */
  status: text('status').notNull().default('active'),
  /** Markdown summary generated on meeting end. */
  minutesMd: text('minutes_md'),
  /** JSON-encoded string[] of attendee employee ids. */
  attendeesJson: text('attendees_json').notNull().default('[]'),
  /** JSON-encoded action item array generated on meeting end. */
  actionItemsJson: text('action_items_json').notNull().default('[]'),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
});

// ---------------------------------------------------------------------------
// Phase 5 — M28: Embeddings (RAG)
// ---------------------------------------------------------------------------

/**
 * Vector embeddings for RAG retrieval. Each row is one chunk of embedded
 * content. The raw embedding vector is stored as a BLOB (Float32Array
 * serialized). The companion `vec_embeddings` sqlite-vec virtual table
 * is created best-effort in `vec-init.ts` (same pattern as FTS5).
 *
 * Architectural invariant #5: all LLM calls (including embedding
 * generation) route through provider-router.
 */
export const embeddings = sqliteTable('embeddings', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  /** message | ticket | vault_file | meeting_minutes | goal | project. */
  sourceType: text('source_type').notNull(),
  /** FK to the originating row (message id, ticket id, etc.). */
  sourceId: text('source_id').notNull(),
  /** For long content split into chunks. 0 for single-chunk content. */
  chunkIndex: integer('chunk_index').notNull().default(0),
  /** The raw text that was embedded — used for display in source attribution. */
  contentText: text('content_text').notNull(),
  /** Serialized Float32Array — the embedding vector. */
  embedding: blob('embedding', { mode: 'buffer' }).notNull(),
  createdAt: integer('created_at').notNull(),
});

// ---------------------------------------------------------------------------
// Phase 5 — M30: Command history (Cmd+K palette)
// ---------------------------------------------------------------------------

/**
 * Persisted NLU command history — one row per executed command
 * (successful OR failed). Capped to 20 most-recent rows per company
 * by the CommandService at write time via FIFO eviction. Audit trail
 * for every natural-language command dispatched by the palette.
 *
 * `executed_at` is an ISO-8601 string so it sorts correctly lex and
 * round-trips through JSON without timezone surprises. `result_id`
 * is a string column even though some handlers return numeric ids —
 * we coerce at the boundary so the schema can hold any id shape.
 */
export const commandHistory = sqliteTable('command_history', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  /** Actor who fired the command — 'user' for Rocky, else an employee id. */
  actorId: text('actor_id').notNull(),
  /** Raw user text at the palette. */
  text: text('text').notNull(),
  /** Classified `IntentName` from the NLU classifier. */
  intent: text('intent').notNull(),
  /** JSON-serialized `Record<string, string>` of dispatched entities. */
  entitiesJson: text('entities_json').notNull(),
  /** ISO-8601 timestamp (UTC). */
  executedAt: text('executed_at').notNull(),
  /** 'ok' | 'error'. */
  outcome: text('outcome').notNull(),
  /** Stringified result id from the dispatched handler, if any. */
  resultId: text('result_id'),
});

// ---------------------------------------------------------------------------
// Phase 5 — M33: Copilot Insights
// ---------------------------------------------------------------------------

/**
 * Periodic-analyzer output — proactive ambient insights produced by the
 * `system-copilot` pseudo-employee (M33 T2) on a configurable interval
 * (M33 T7) and surfaced in the Copilot UI (M34). The analyzer dedupes
 * incoming drafts against existing active rows via `upsertWithDedup`
 * (Jaccard bigram > 0.8 over lowercased titles, scoped to the same
 * `(company_id, category)` bucket, with a numeric-drift guard so a
 * count change like "3 blocked tickets" → "4 blocked tickets" never
 * silently merges and masks the change).
 *
 * Schema per Phase 5 §8.4. `category` and `severity` are constrained
 * via `CHECK` at the SQL DDL layer — Drizzle does not model `CHECK`,
 * so the constraint set lives in `migrations/0011_copilot_insights.sql`.
 *
 * Composite index `idx_insights_company_active(company_id, dismissed_at,
 * expires_at)` accelerates the hot-path `listActive` query
 * (`WHERE company_id = ? AND dismissed_at IS NULL AND expires_at > ?`).
 *
 * Lifecycle: `create` → user dismissal stamps `dismissed_at`, OR the
 * analyzer's `expireStale` sweep physically deletes rows past
 * `expires_at`. Insights are NOT events — the `events` table stays
 * append-only (architectural invariant #6).
 */
export const copilotInsights = sqliteTable('copilot_insights', {
  id: text('id').primaryKey(),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  /** operational | cost | org | workflow | anomaly. CHECK at DDL. */
  category: text('category').notNull(),
  /** critical | warning | info. CHECK at DDL. */
  severity: text('severity').notNull(),
  /** Short headline rendered as the insight card title. */
  title: text('title').notNull(),
  /** Markdown body — supporting evidence, numbers, source attribution. */
  detail: text('detail').notNull(),
  /** Optional human-readable suggestion ("Reassign blocked tickets to Bob"). */
  actionSuggestion: text('action_suggestion'),
  /** Optional NLU intent name to dispatch when the user clicks the action button (M34). */
  actionIntent: text('action_intent'),
  /** Optional JSON-serialized entity map for the action intent. */
  actionEntitiesJson: text('action_entities_json'),
  /** Stamped when the user dismisses the insight. NULL = active. */
  dismissedAt: integer('dismissed_at'),
  createdAt: integer('created_at').notNull(),
  /** Hard expiry — `expireStale` deletes rows where `expires_at < now`. */
  expiresAt: integer('expires_at').notNull(),
});
