/**
 * Team-X Phase 1 SQLite schema.
 *
 * This is the minimum set of tables needed to boot a single company with one
 * hardcoded CEO + one Senior Fullstack Engineer, stream an LLM response, and
 * render the live cockpit events feed. Later phases extend with tables for
 * goals / projects / tickets / MCP tool registry / file vault / backups.
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

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
});

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
