CREATE TABLE `approval_decisions` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL,
  `approval_kind` text NOT NULL,
  `approval_ref_id` text NOT NULL,
  `decision` text NOT NULL,
  `decided_by_operator_id` text,
  `rationale` text,
  `payload_json` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_approval_decisions_company` ON `approval_decisions` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_approval_decisions_company_ref` ON `approval_decisions` (`company_id`, `approval_kind`, `approval_ref_id`);
--> statement-breakpoint
CREATE INDEX `idx_approval_decisions_created` ON `approval_decisions` (`created_at`);
