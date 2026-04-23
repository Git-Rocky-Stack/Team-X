CREATE TABLE `thread_digests` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL,
  `thread_id` text NOT NULL,
  `summary` text NOT NULL,
  `pinned_facts_json` text DEFAULT '[]' NOT NULL,
  `last_summarized_message_id` text,
  `estimated_tokens` integer DEFAULT 0 NOT NULL,
  `freshness` text DEFAULT 'stale' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`last_summarized_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_thread_digests_company` ON `thread_digests` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_thread_digests_thread` ON `thread_digests` (`thread_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_thread_digests_thread` ON `thread_digests` (`thread_id`);
--> statement-breakpoint
CREATE TABLE `run_checkpoints` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL,
  `thread_id` text NOT NULL,
  `run_id` text,
  `employee_id` text,
  `checkpoint_kind` text NOT NULL,
  `objective` text,
  `progress_summary` text NOT NULL,
  `blockers_json` text DEFAULT '[]' NOT NULL,
  `next_action` text,
  `active_artifact_refs_json` text DEFAULT '[]' NOT NULL,
  `unresolved_approval_refs_json` text DEFAULT '[]' NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_run_checkpoints_company` ON `run_checkpoints` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_run_checkpoints_thread` ON `run_checkpoints` (`thread_id`);
--> statement-breakpoint
CREATE INDEX `idx_run_checkpoints_thread_created` ON `run_checkpoints` (`thread_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_run_checkpoints_run` ON `run_checkpoints` (`run_id`);
--> statement-breakpoint
CREATE INDEX `idx_run_checkpoints_employee` ON `run_checkpoints` (`employee_id`);
