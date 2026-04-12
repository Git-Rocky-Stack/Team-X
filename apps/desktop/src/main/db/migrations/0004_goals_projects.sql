CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL REFERENCES `companies`(`id`),
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`progress_pct` integer DEFAULT 0 NOT NULL,
	`target_date` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL REFERENCES `companies`(`id`),
	`goal_id` text REFERENCES `goals`(`id`),
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'planning' NOT NULL,
	`lead_id` text REFERENCES `employees`(`id`),
	`priority` text DEFAULT 'medium' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_tickets` (
	`project_id` text NOT NULL REFERENCES `projects`(`id`),
	`ticket_id` text NOT NULL REFERENCES `tickets`(`id`)
);
