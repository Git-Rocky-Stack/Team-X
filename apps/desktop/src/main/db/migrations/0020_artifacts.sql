CREATE TABLE `artifacts` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL,
  `kind` text NOT NULL,
  `outcome_kind` text DEFAULT 'artifact-created' NOT NULL,
  `status` text DEFAULT 'ready' NOT NULL,
  `title` text NOT NULL,
  `summary` text,
  `source_kind` text NOT NULL,
  `source_ref_id` text NOT NULL,
  `ticket_id` text,
  `file_id` text,
  `approval_item_id` text,
  `approval_decision_id` text,
  `uri` text,
  `preview_json` text DEFAULT '{}' NOT NULL,
  `created_by_employee_id` text,
  `created_by_routine_id` text,
  `approved_by_operator_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`file_id`) REFERENCES `file_vault`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`approval_item_id`) REFERENCES `approval_items`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`approval_decision_id`) REFERENCES `approval_decisions`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`created_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`created_by_routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`approved_by_operator_id`) REFERENCES `operators`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_artifacts_company` ON `artifacts` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_artifacts_company_created` ON `artifacts` (`company_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_artifacts_company_kind` ON `artifacts` (`company_id`, `kind`);
--> statement-breakpoint
CREATE INDEX `idx_artifacts_company_source` ON `artifacts` (`company_id`, `source_kind`, `source_ref_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_artifacts_company_kind_source` ON `artifacts` (`company_id`, `kind`, `source_kind`, `source_ref_id`);
