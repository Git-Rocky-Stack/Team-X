CREATE TABLE IF NOT EXISTS `schedule_items` (
  `id` text PRIMARY KEY NOT NULL,
  `company_id` text NOT NULL,
  `title` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `kind` text DEFAULT 'task' NOT NULL,
  `status` text DEFAULT 'scheduled' NOT NULL,
  `priority` text DEFAULT 'medium' NOT NULL,
  `starts_at` integer NOT NULL,
  `ends_at` integer,
  `reminder_at` integer,
  `ticket_id` text,
  `project_id` text,
  `goal_id` text,
  `assignee_id` text,
  `wakeup_request_id` text,
  `source_kind` text DEFAULT 'manual' NOT NULL,
  `source_id` text,
  `created_by_id` text NOT NULL,
  `created_by_kind` text DEFAULT 'user' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `completed_at` integer,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`assignee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`wakeup_request_id`) REFERENCES `agent_wakeup_requests`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_schedule_items_company` ON `schedule_items` (`company_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_schedule_items_company_starts` ON `schedule_items` (`company_id`,`starts_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_schedule_items_company_status` ON `schedule_items` (`company_id`,`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_schedule_items_ticket` ON `schedule_items` (`ticket_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_schedule_items_project` ON `schedule_items` (`project_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_schedule_items_goal` ON `schedule_items` (`goal_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_schedule_items_assignee` ON `schedule_items` (`assignee_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_schedule_items_wakeup` ON `schedule_items` (`wakeup_request_id`);
