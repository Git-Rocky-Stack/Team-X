-- C4 (audit 2026-05-07) — Move write-side amber gate to the tool layer.
--
-- Before this migration: `delegate_subtask` from the agentic loop inserted
-- directly into the `tickets` table, side-stepping the amber confirmation
-- gate that was nominally enforced at the command-palette layer for
-- `complex_request` intents. Any agent already inside the loop on a
-- `system-agent` or eligible employee — including LLM-generated
-- `actionIntent` from copilot insights — could create a real ticket
-- without an operator click.
--
-- After this migration: `delegate_subtask` writes to
-- `pending_delegations`, the approval-inbox-service surfaces the row in
-- the operator inbox, and on approval the row is materialized into a
-- real ticket via the existing `tickets` insert path. The audit log gets
-- the four-component score breakdown (role_fit, load, availability,
-- past_performance) the audit explicitly called out as missing from
-- `task.delegated`.
--
-- Schema design:
--   id              text  PK   nanoid
--   company_id      text  FK   tenant scope
--   plan_id         text       provenance from `decompose_project`
--   subtask_title   text       human label
--   description     text       optional narrative
--   priority        text       'low'|'medium'|'high'|'critical'
--   assignee_id     text  FK   chosen candidate from the fallback chain
--   assignee_name   text       denormalized for display in the inbox
--   parent_project_id text FK  optional project linkage
--   subtask_type    text       optional planner hint
--   fallback_used   integer    1 if a fallback was selected, else 0
--   attempt_count   integer    1-indexed position in the chain that won
--   score           real       final aggregate score in [0, 1]
--   role_fit        real       capability/role-spec match component
--   load_ratio      real       open-ticket load component
--   availability    real       meeting/availability component
--   past_performance real      historical-completion component
--   reporter_id     text       actor who invoked the tool
--   reporter_kind   text       'user'|'employee'|'agent'|'system'
--   labels_json     text       JSON-encoded string[]
--   dependencies_json text     JSON-encoded string[] (blocking ticket ids)
--   sla_hours       integer    optional SLA target hours
--   due_at          integer    optional due timestamp
--   status          text       'pending'|'approved'|'rejected'
--   created_at      integer    created timestamp (ms)
--   updated_at      integer    updated timestamp (ms)
--   resolved_at     integer    null until approve/reject
--   resolved_by_operator_id text optional
--   rationale       text       optional reviewer rationale
--   ticket_id       text  FK   set on approve when the row is materialized

CREATE TABLE `pending_delegations` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL,
  `plan_id` text NOT NULL,
  `subtask_title` text NOT NULL,
  `description` text NOT NULL DEFAULT '',
  `priority` text NOT NULL DEFAULT 'medium',
  `assignee_id` text NOT NULL,
  `assignee_name` text NOT NULL DEFAULT '',
  `parent_project_id` text,
  `subtask_type` text,
  `fallback_used` integer NOT NULL DEFAULT 0,
  `attempt_count` integer NOT NULL DEFAULT 1,
  `score` real NOT NULL DEFAULT 0,
  `role_fit` real NOT NULL DEFAULT 0,
  `load_ratio` real NOT NULL DEFAULT 0,
  `availability` real NOT NULL DEFAULT 0,
  `past_performance` real NOT NULL DEFAULT 0,
  `reporter_id` text NOT NULL,
  `reporter_kind` text NOT NULL DEFAULT 'agent',
  `labels_json` text NOT NULL DEFAULT '[]',
  `dependencies_json` text NOT NULL DEFAULT '[]',
  `sla_hours` integer,
  `due_at` integer,
  `status` text NOT NULL DEFAULT 'pending',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `resolved_at` integer,
  `resolved_by_operator_id` text,
  `rationale` text,
  -- Set on approve when the row was materialized into a real ticket.
  -- No FK to `tickets` here: the approval-inbox-service is the
  -- authoritative caller (it creates the ticket THEN calls markApproved
  -- with that id), and a hard FK forces every test fake to insert a
  -- matching ticket row even when the test only exercises pending-row
  -- state. Logical integrity is enforced by the inbox service.
  `ticket_id` text,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`assignee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`parent_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pending_delegations_company` ON `pending_delegations` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_pending_delegations_company_status` ON `pending_delegations` (`company_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_pending_delegations_plan` ON `pending_delegations` (`plan_id`);
