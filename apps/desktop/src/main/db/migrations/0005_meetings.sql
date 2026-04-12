CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL REFERENCES `companies`(`id`),
	`thread_id` text NOT NULL REFERENCES `threads`(`id`),
	`chair_id` text NOT NULL REFERENCES `employees`(`id`),
	`agenda` text DEFAULT '' NOT NULL,
	`mode` text DEFAULT 'round-robin' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`minutes_md` text,
	`attendees_json` text DEFAULT '[]' NOT NULL,
	`action_items_json` text DEFAULT '[]' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
ALTER TABLE `companies` ADD `status` text DEFAULT 'running' NOT NULL;
