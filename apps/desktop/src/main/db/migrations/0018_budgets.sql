CREATE TABLE `budget_policies` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL,
  `scope_kind` text NOT NULL,
  `scope_ref_id` text NOT NULL,
  `period` text DEFAULT 'monthly' NOT NULL,
  `hard_cap_usd` text NOT NULL,
  `warning_threshold_pct` integer DEFAULT 80 NOT NULL,
  `auto_pause` integer DEFAULT 0 NOT NULL,
  `require_approval_above_usd` text,
  `enabled` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_budget_policies_company` ON `budget_policies` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_budget_policies_company_scope` ON `budget_policies` (`company_id`, `scope_kind`, `scope_ref_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_budget_policies_company_scope_period` ON `budget_policies` (`company_id`, `scope_kind`, `scope_ref_id`, `period`);
--> statement-breakpoint
CREATE TABLE `budget_ledger_entries` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL,
  `budget_policy_id` text,
  `scope_kind` text NOT NULL,
  `scope_ref_id` text NOT NULL,
  `run_id` text NOT NULL,
  `run_kind` text NOT NULL,
  `thread_id` text,
  `employee_id` text NOT NULL,
  `runtime_profile_id` text,
  `routine_id` text,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `amount_usd` text NOT NULL,
  `occurred_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`budget_policy_id`) REFERENCES `budget_policies`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_budget_ledger_entries_company` ON `budget_ledger_entries` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_budget_ledger_entries_company_scope` ON `budget_ledger_entries` (`company_id`, `scope_kind`, `scope_ref_id`);
--> statement-breakpoint
CREATE INDEX `idx_budget_ledger_entries_run` ON `budget_ledger_entries` (`run_id`);
--> statement-breakpoint
CREATE INDEX `idx_budget_ledger_entries_company_occurred` ON `budget_ledger_entries` (`company_id`, `occurred_at`);
--> statement-breakpoint
CREATE INDEX `idx_budget_ledger_entries_company_provider` ON `budget_ledger_entries` (`company_id`, `provider`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_budget_ledger_entries_scope_run` ON `budget_ledger_entries` (`scope_kind`, `scope_ref_id`, `run_id`);
--> statement-breakpoint
CREATE TABLE `approval_items` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL,
  `kind` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `priority` text DEFAULT 'medium' NOT NULL,
  `requested_by_operator_id` text,
  `requested_by_employee_id` text,
  `subject_ref_kind` text NOT NULL,
  `subject_ref_id` text NOT NULL,
  `summary` text NOT NULL,
  `payload_json` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL,
  `resolved_at` integer,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_approval_items_company` ON `approval_items` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_approval_items_company_status` ON `approval_items` (`company_id`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_approval_items_company_kind` ON `approval_items` (`company_id`, `kind`);
--> statement-breakpoint
CREATE INDEX `idx_approval_items_company_subject` ON `approval_items` (`company_id`, `subject_ref_kind`, `subject_ref_id`);
