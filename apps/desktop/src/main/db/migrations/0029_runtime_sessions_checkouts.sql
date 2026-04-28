CREATE TABLE `runtime_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL,
  `employee_id` text NOT NULL,
  `runtime_profile_id` text,
  `adapter_kind` text NOT NULL,
  `status` text DEFAULT 'starting' NOT NULL,
  `current_run_id` text,
  `current_ticket_id` text,
  `pid` integer,
  `endpoint_url` text,
  `workspace_path` text,
  `capabilities_json` text DEFAULT '{}' NOT NULL,
  `last_heartbeat_at` integer,
  `lease_expires_at` integer,
  `failure_reason` text,
  `started_at` integer NOT NULL,
  `ended_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`runtime_profile_id`) REFERENCES `runtime_profiles`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`current_run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`current_ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_runtime_sessions_company` ON `runtime_sessions` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_runtime_sessions_employee` ON `runtime_sessions` (`employee_id`);
--> statement-breakpoint
CREATE INDEX `idx_runtime_sessions_profile` ON `runtime_sessions` (`runtime_profile_id`);
--> statement-breakpoint
CREATE INDEX `idx_runtime_sessions_company_status` ON `runtime_sessions` (`company_id`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_runtime_sessions_company_heartbeat` ON `runtime_sessions` (`company_id`, `last_heartbeat_at`);
--> statement-breakpoint
CREATE INDEX `idx_runtime_sessions_current_run` ON `runtime_sessions` (`current_run_id`);
--> statement-breakpoint
CREATE INDEX `idx_runtime_sessions_current_ticket` ON `runtime_sessions` (`current_ticket_id`);
--> statement-breakpoint
CREATE TABLE `runtime_heartbeats` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `company_id` text NOT NULL,
  `employee_id` text NOT NULL,
  `runtime_profile_id` text,
  `status` text NOT NULL,
  `current_run_id` text,
  `current_ticket_id` text,
  `cost_delta_json` text DEFAULT '{}' NOT NULL,
  `message` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `runtime_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`runtime_profile_id`) REFERENCES `runtime_profiles`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`current_run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`current_ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_runtime_heartbeats_session` ON `runtime_heartbeats` (`session_id`);
--> statement-breakpoint
CREATE INDEX `idx_runtime_heartbeats_company_created` ON `runtime_heartbeats` (`company_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_runtime_heartbeats_employee_created` ON `runtime_heartbeats` (`employee_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `ticket_checkouts` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL,
  `ticket_id` text NOT NULL,
  `employee_id` text NOT NULL,
  `runtime_session_id` text,
  `run_id` text,
  `status` text DEFAULT 'active' NOT NULL,
  `claimed_at` integer NOT NULL,
  `last_heartbeat_at` integer,
  `expires_at` integer NOT NULL,
  `released_at` integer,
  `release_reason` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`runtime_session_id`) REFERENCES `runtime_sessions`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_ticket_checkouts_company` ON `ticket_checkouts` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_ticket_checkouts_ticket` ON `ticket_checkouts` (`ticket_id`);
--> statement-breakpoint
CREATE INDEX `idx_ticket_checkouts_employee` ON `ticket_checkouts` (`employee_id`);
--> statement-breakpoint
CREATE INDEX `idx_ticket_checkouts_session` ON `ticket_checkouts` (`runtime_session_id`);
--> statement-breakpoint
CREATE INDEX `idx_ticket_checkouts_run` ON `ticket_checkouts` (`run_id`);
--> statement-breakpoint
CREATE INDEX `idx_ticket_checkouts_company_status` ON `ticket_checkouts` (`company_id`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_ticket_checkouts_ticket_status` ON `ticket_checkouts` (`ticket_id`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_ticket_checkouts_expires` ON `ticket_checkouts` (`expires_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_ticket_checkouts_active_ticket` ON `ticket_checkouts` (`ticket_id`) WHERE `status` = 'active';
