CREATE TABLE `routines` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  `enabled` integer DEFAULT 1 NOT NULL,
  `trigger_kind` text NOT NULL,
  `schedule_json` text DEFAULT '{}' NOT NULL,
  `work_kind` text DEFAULT 'ticket' NOT NULL,
  `work_config_json` text DEFAULT '{}' NOT NULL,
  `last_run_status` text DEFAULT 'never' NOT NULL,
  `last_run_message` text,
  `last_run_at` integer,
  `next_run_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_routines_company` ON `routines` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_routines_company_slug` ON `routines` (`company_id`, `slug`);
--> statement-breakpoint
CREATE INDEX `idx_routines_company_next_run` ON `routines` (`company_id`, `next_run_at`);
--> statement-breakpoint
CREATE TABLE `routine_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL,
  `routine_id` text NOT NULL,
  `status` text NOT NULL,
  `reason` text NOT NULL,
  `work_kind` text DEFAULT 'ticket' NOT NULL,
  `scheduled_for` integer,
  `started_at` integer NOT NULL,
  `finished_at` integer,
  `ticket_id` text,
  `message` text,
  `error_message` text,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_routine_runs_company` ON `routine_runs` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_routine_runs_routine` ON `routine_runs` (`routine_id`);
--> statement-breakpoint
CREATE INDEX `idx_routine_runs_routine_started` ON `routine_runs` (`routine_id`, `started_at`);
--> statement-breakpoint
CREATE INDEX `idx_routine_runs_company_started` ON `routine_runs` (`company_id`, `started_at`);
