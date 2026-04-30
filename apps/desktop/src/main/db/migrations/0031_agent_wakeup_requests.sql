CREATE TABLE IF NOT EXISTS `agent_wakeup_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`trigger_type` text NOT NULL,
	`trigger_id` text,
	`priority` integer DEFAULT 50 NOT NULL,
	`scheduled_for` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 4 NOT NULL,
	`next_retry_at` integer,
	`context_json` text DEFAULT '{}' NOT NULL,
	`result_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_agent_wakeup_requests_company` ON `agent_wakeup_requests` (`company_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_agent_wakeup_requests_company_status` ON `agent_wakeup_requests` (`company_id`,`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_agent_wakeup_requests_agent_scheduled` ON `agent_wakeup_requests` (`agent_id`,`scheduled_for`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_agent_wakeup_requests_priority_scheduled` ON `agent_wakeup_requests` (`priority`,`scheduled_for`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_agent_wakeup_requests_trigger_type` ON `agent_wakeup_requests` (`trigger_type`);
