CREATE TABLE `ticket_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL REFERENCES `tickets`(`id`),
	`file_id` text NOT NULL REFERENCES `file_vault`(`id`),
	`attached_by` text NOT NULL,
	`attached_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ticket_attachments_ticket` ON `ticket_attachments` (`ticket_id`);
--> statement-breakpoint
CREATE INDEX `idx_ticket_attachments_file` ON `ticket_attachments` (`file_id`);
