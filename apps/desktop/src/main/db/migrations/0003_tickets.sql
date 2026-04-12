CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL REFERENCES `companies`(`id`),
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`assignee_id` text REFERENCES `employees`(`id`),
	`reporter_id` text NOT NULL,
	`reporter_kind` text DEFAULT 'user' NOT NULL,
	`labels_json` text DEFAULT '[]' NOT NULL,
	`dependencies_json` text DEFAULT '[]' NOT NULL,
	`sla_hours` integer,
	`due_at` integer,
	`thread_id` text REFERENCES `threads`(`id`),
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`closed_at` integer
);--> statement-breakpoint
ALTER TABLE `threads` ADD `ticket_id` text;
